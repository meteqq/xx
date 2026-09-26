// Para hareketi üreten tüm işlemlerin iş kuralları burada toplanır.
// Her fonksiyon tek bir veritabanı transaction'ı içinde çalışır.
const { db } = require('../db');
const { hata, bugun, gunEkle, tutar, tarih, zorunlu, secenek } = require('../util');

const ODEME_SEKILLERI = ['nakit', 'kredi_karti', 'havale', 'cek', 'senet', 'mahsup', 'diger'];
const SEKIL_AD = {
  nakit: 'Nakit', kredi_karti: 'Kredi Kartı', havale: 'Havale/EFT', cek: 'Çek',
  senet: 'Senet', mahsup: 'Cari Mahsup', diger: 'Diğer',
};

function tx(fn) {
  return db().transaction(fn)();
}

function yeniIslem(tur, t, aciklama, belge_no) {
  return db().prepare('INSERT INTO islemler (tur, tarih, aciklama, belge_no) VALUES (?, ?, ?, ?)')
    .run(tur, t, aciklama || null, belge_no || null).lastInsertRowid;
}

function cariGetir(id) {
  const c = db().prepare('SELECT * FROM cariler WHERE id = ?').get(id);
  if (!c) throw hata(404, 'Cari bulunamadı');
  return c;
}

function hesapGetir(id, tipler) {
  const h = db().prepare('SELECT * FROM hesaplar WHERE id = ?').get(id);
  if (!h) throw hata(400, 'Hesap seçilmedi');
  if (tipler && !tipler.includes(h.tip)) throw hata(400, `"${h.ad}" bu işlem için uygun bir hesap değil`);
  return h;
}

function cariHareket(h) {
  return db().prepare(`INSERT INTO cari_hareketler
    (islem_id, cari_id, tarih, vade, tur, odeme_sekli, borc, alacak, aciklama, belge_no, hesap_id, cek_id, fatura_id)
    VALUES (@islem_id, @cari_id, @tarih, @vade, @tur, @odeme_sekli, @borc, @alacak, @aciklama, @belge_no, @hesap_id, @cek_id, @fatura_id)`)
    .run({ vade: null, odeme_sekli: null, borc: 0, alacak: 0, aciklama: null, belge_no: null,
      hesap_id: null, cek_id: null, fatura_id: null, ...h }).lastInsertRowid;
}

function hesapHareket(h) {
  return db().prepare(`INSERT INTO hesap_hareketleri
    (islem_id, hesap_id, tarih, valor, tur, giris, cikis, aciklama, cari_id, kategori)
    VALUES (@islem_id, @hesap_id, @tarih, @valor, @tur, @giris, @cikis, @aciklama, @cari_id, @kategori)`)
    .run({ valor: null, giris: 0, cikis: 0, aciklama: null, cari_id: null, kategori: null, ...h }).lastInsertRowid;
}

function cekHareket(cek_id, islem_id, t, eski, yeni, aciklama) {
  db().prepare(`INSERT INTO cek_hareketleri (cek_id, islem_id, tarih, eski_durum, yeni_durum, aciklama)
    VALUES (?, ?, ?, ?, ?, ?)`).run(cek_id, islem_id, t, eski, yeni, aciklama || null);
}

function kurluTutar(t, kur) {
  const k = kur === undefined || kur === null || kur === '' ? 1 : Number(kur);
  if (!Number.isFinite(k) || k <= 0) throw hata(400, 'Kur geçersiz');
  return Math.round(t * k);
}

/**
 * Tahsilat (cariden para alma) veya ödeme (cariye para verme) kaydeder.
 * Bir işlem birden fazla ödeme şekli satırı içerebilir (parçalı ödeme).
 */
function odemeKaydet(g) {
  const yon = secenek(g.yon, ['tahsilat', 'odeme'], 'İşlem yönü');
  const cari = cariGetir(g.cari_id);
  const t = tarih(g.tarih || bugun());
  const satirlar = Array.isArray(g.satirlar) ? g.satirlar : [];
  if (!satirlar.length) throw hata(400, 'En az bir ödeme satırı girin');
  const tahsilat = yon === 'tahsilat';

  return tx(() => {
    const islem_id = yeniIslem(yon, t, g.aciklama, g.belge_no);
    const ortak = { islem_id, cari_id: cari.id, tarih: t, tur: yon, belge_no: g.belge_no || null };
    // Cari tarafı: tahsilatta cari alacaklanır, ödemede borçlanır.
    const cariTaraf = (tt) => (tahsilat ? { alacak: tt } : { borc: tt });

    for (const s of satirlar) {
      const sekil = secenek(s.sekil, ODEME_SEKILLERI, 'Ödeme şekli');
      const tt = tutar(s.tutar);
      const aciklama = s.aciklama || g.aciklama || `${SEKIL_AD[sekil]} ${tahsilat ? 'tahsilat' : 'ödeme'}`;

      if (sekil === 'nakit' || sekil === 'havale' || sekil === 'kredi_karti') {
        const tipler = sekil === 'nakit' ? ['kasa'] : sekil === 'havale' ? ['banka']
          : tahsilat ? ['pos'] : ['kart', 'banka'];
        const hesap = hesapGetir(s.hesap_id, tipler);
        const htutar = kurluTutar(tt, s.kur);
        cariHareket({ ...ortak, ...cariTaraf(tt), odeme_sekli: sekil, aciklama, hesap_id: hesap.id });
        const valor = hesap.tip === 'pos' ? gunEkle(t, hesap.valor_gun) : null;
        hesapHareket({ islem_id, hesap_id: hesap.id, tarih: t, valor, tur: yon, cari_id: cari.id,
          aciklama: `${cari.unvan} - ${aciklama}`, ...(tahsilat ? { giris: htutar } : { cikis: htutar }) });
        if (hesap.tip === 'pos' && hesap.komisyon > 0) {
          hesapHareket({ islem_id, hesap_id: hesap.id, tarih: t, valor, tur: 'komisyon', kategori: 'POS Komisyonu',
            cikis: Math.round(htutar * hesap.komisyon / 100), aciklama: `POS komisyonu %${hesap.komisyon} - ${cari.unvan}` });
        }
      } else if (sekil === 'cek' || sekil === 'senet') {
        let cekId;
        if (!tahsilat && s.cek_id) {
          // Portföydeki müşteri çekini/senedini tedarikçiye ciro et
          const cek = db().prepare('SELECT * FROM cek_senet WHERE id = ?').get(s.cek_id);
          if (!cek || cek.yon !== 'alinan' || cek.durum !== 'portfoy') throw hata(400, 'Ciro edilecek evrak portföyde değil');
          if (cek.tutar !== tt) throw hata(400, 'Ciro edilen evrakın tutarı satır tutarıyla aynı olmalı');
          db().prepare("UPDATE cek_senet SET durum = 'ciro', ciro_cari_id = ? WHERE id = ?").run(cari.id, cek.id);
          cekHareket(cek.id, islem_id, t, 'portfoy', 'ciro', `${cari.unvan} carisine ciro edildi`);
          cekId = cek.id;
        } else {
          const c = s.cek || {};
          const vade = tarih(c.vade, 'Vade tarihi');
          if (sekil === 'cek' && !c.no) throw hata(400, 'Çek numarası gerekli');
          cekId = db().prepare(`INSERT INTO cek_senet
            (tur, yon, no, banka, sube, hesap_no, kesideci, kefil, tutar, doviz, duzenleme, vade, durum, cari_id, hesap_id, islem_id, aciklama)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            sekil, tahsilat ? 'alinan' : 'verilen', c.no || null, c.banka || null, c.sube || null, c.hesap_no || null,
            c.kesideci || (tahsilat ? cari.unvan : null), c.kefil || null, tt, cari.doviz, t, vade,
            tahsilat ? 'portfoy' : 'verildi', cari.id, c.hesap_id || null, islem_id, c.aciklama || null,
          ).lastInsertRowid;
          cekHareket(cekId, islem_id, t, null, tahsilat ? 'portfoy' : 'verildi',
            tahsilat ? `${cari.unvan} carisinden alındı` : `${cari.unvan} carisine verildi`);
        }
        const cek = db().prepare('SELECT * FROM cek_senet WHERE id = ?').get(cekId);
        cariHareket({ ...ortak, ...cariTaraf(tt), odeme_sekli: sekil, cek_id: cekId, vade: cek.vade,
          aciklama: `${SEKIL_AD[sekil]} No: ${cek.no || '-'} Vade: ${cek.vade.split('-').reverse().join('.')}${s.aciklama ? ' - ' + s.aciklama : ''}` });
      } else if (sekil === 'mahsup') {
        const hedef = cariGetir(s.hedef_cari_id);
        if (hedef.id === cari.id) throw hata(400, 'Mahsup için farklı bir cari seçin');
        cariHareket({ ...ortak, ...cariTaraf(tt), odeme_sekli: 'mahsup', aciklama: `${hedef.unvan} ile mahsup${s.aciklama ? ' - ' + s.aciklama : ''}` });
        cariHareket({ ...ortak, cari_id: hedef.id, tur: 'mahsup', odeme_sekli: 'mahsup',
          ...(tahsilat ? { borc: tt } : { alacak: tt }), aciklama: `${cari.unvan} ile mahsup${s.aciklama ? ' - ' + s.aciklama : ''}` });
      } else {
        cariHareket({ ...ortak, ...cariTaraf(tt), odeme_sekli: 'diger', aciklama });
      }
    }
    return islem_id;
  });
}

/** Cariye elle borç/alacak kaydı (dekont, açılış bakiyesi). */
function dekontKaydet(g) {
  const cari = cariGetir(g.cari_id);
  const yon = secenek(g.yon, ['borc', 'alacak'], 'Borç/alacak');
  const tt = tutar(g.tutar);
  const t = tarih(g.tarih || bugun());
  const tur = g.tur === 'acilis' ? 'acilis' : yon === 'borc' ? 'borc_dekont' : 'alacak_dekont';
  return tx(() => {
    const islem_id = yeniIslem(tur, t, g.aciklama, g.belge_no);
    cariHareket({ islem_id, cari_id: cari.id, tarih: t, vade: tarih(g.vade, 'Vade', { bos: true }), tur,
      [yon]: tt, aciklama: g.aciklama || (tur === 'acilis' ? 'Açılış bakiyesi' : 'Dekont'), belge_no: g.belge_no });
    return islem_id;
  });
}

/** Kasa/banka hesapları arası virman, gelir ve gider kayıtları. */
function hesapIslemi(g) {
  const tur = secenek(g.tur, ['gelir', 'gider', 'virman', 'acilis'], 'İşlem türü');
  const tt = tutar(g.tutar);
  const t = tarih(g.tarih || bugun());
  const hesap = hesapGetir(g.hesap_id);
  return tx(() => {
    const islem_id = yeniIslem(tur, t, g.aciklama, g.belge_no);
    if (tur === 'virman') {
      const hedef = hesapGetir(g.hedef_hesap_id);
      if (hedef.id === hesap.id) throw hata(400, 'Aynı hesaba virman yapılamaz');
      const aciklama = g.aciklama || `${hesap.ad} → ${hedef.ad} virman`;
      hesapHareket({ islem_id, hesap_id: hesap.id, tarih: t, tur, cikis: tt, aciklama });
      hesapHareket({ islem_id, hesap_id: hedef.id, tarih: t, tur, giris: kurluTutar(tt, g.kur), aciklama });
    } else {
      hesapHareket({ islem_id, hesap_id: hesap.id, tarih: t, tur, kategori: g.kategori || null,
        [tur === 'gider' ? 'cikis' : 'giris']: tt,
        aciklama: g.aciklama || (tur === 'acilis' ? 'Açılış bakiyesi' : g.kategori || tur) });
    }
    return islem_id;
  });
}

// Çek/senet durum geçişleri: [izinli mevcut durumlar, yön]
const CEK_ISLEMLERI = {
  tahsile_ver: { yon: 'alinan', from: ['portfoy'], to: 'tahsilde' },
  tahsil:      { yon: 'alinan', from: ['portfoy', 'tahsilde'], to: 'tahsil' },
  ciro:        { yon: 'alinan', from: ['portfoy'], to: 'ciro' },
  karsiliksiz: { yon: 'alinan', from: ['portfoy', 'tahsilde', 'ciro'], to: 'karsiliksiz' },
  iade:        { yon: 'alinan', from: ['portfoy'], to: 'iade' },
  portfoye_al: { yon: 'alinan', from: ['tahsilde'], to: 'portfoy' },
  ode:         { yon: 'verilen', from: ['verildi'], to: 'odendi' },
  geri_al:     { yon: 'verilen', from: ['verildi'], to: 'iade' },
};

function cekIslemi(cekId, g) {
  const cek = db().prepare('SELECT * FROM cek_senet WHERE id = ?').get(cekId);
  if (!cek) throw hata(404, 'Evrak bulunamadı');
  const tanim = CEK_ISLEMLERI[g.islem];
  if (!tanim) throw hata(400, 'Geçersiz işlem');
  if (tanim.yon !== cek.yon || !tanim.from.includes(cek.durum)) {
    throw hata(400, 'Bu evrak mevcut durumunda bu işleme uygun değil');
  }
  const t = tarih(g.tarih || bugun());
  const ad = `${cek.tur === 'cek' ? 'Çek' : 'Senet'} No: ${cek.no || '-'}`;
  const cari = cek.cari_id ? cariGetir(cek.cari_id) : null;

  return tx(() => {
    const islem_id = yeniIslem('cek_' + g.islem, t, g.aciklama);
    let aciklama = g.aciklama || '';
    const guncelle = { durum: tanim.to };

    switch (g.islem) {
      case 'tahsile_ver': {
        const h = hesapGetir(g.hesap_id, ['banka']);
        guncelle.hesap_id = h.id;
        aciklama = aciklama || `${h.ad} hesabına tahsile verildi`;
        break;
      }
      case 'portfoye_al':
        guncelle.hesap_id = null;
        aciklama = aciklama || 'Bankadan portföye geri alındı';
        break;
      case 'tahsil': {
        const h = hesapGetir(g.hesap_id || cek.hesap_id, ['kasa', 'banka']);
        guncelle.hesap_id = h.id;
        hesapHareket({ islem_id, hesap_id: h.id, tarih: t, tur: 'cek_tahsil', giris: cek.tutar,
          cari_id: cek.cari_id, aciklama: `${ad} tahsil edildi${cari ? ' - ' + cari.unvan : ''}` });
        aciklama = aciklama || `${h.ad} hesabına tahsil edildi`;
        break;
      }
      case 'ciro': {
        const hedef = cariGetir(g.cari_id);
        guncelle.ciro_cari_id = hedef.id;
        cariHareket({ islem_id, cari_id: hedef.id, tarih: t, vade: cek.vade, tur: 'odeme', odeme_sekli: cek.tur,
          borc: cek.tutar, cek_id: cek.id, aciklama: `${ad} ciro edildi (Vade: ${cek.vade.split('-').reverse().join('.')})` });
        aciklama = aciklama || `${hedef.unvan} carisine ciro edildi`;
        break;
      }
      case 'karsiliksiz': {
        if (cek.durum === 'ciro' && cek.ciro_cari_id) {
          const ciroCari = cariGetir(cek.ciro_cari_id);
          cariHareket({ islem_id, cari_id: ciroCari.id, tarih: t, tur: 'cek_iade', odeme_sekli: cek.tur,
            alacak: cek.tutar, cek_id: cek.id, aciklama: `${ad} karşılıksız - ciro iadesi` });
        }
        if (cari) {
          cariHareket({ islem_id, cari_id: cari.id, tarih: t, tur: 'cek_iade', odeme_sekli: cek.tur,
            borc: cek.tutar, cek_id: cek.id, aciklama: `${ad} karşılıksız/protestolu` });
        }
        aciklama = aciklama || 'Karşılıksız / protestolu';
        break;
      }
      case 'iade':
        if (cari) {
          cariHareket({ islem_id, cari_id: cari.id, tarih: t, tur: 'cek_iade', odeme_sekli: cek.tur,
            borc: cek.tutar, cek_id: cek.id, aciklama: `${ad} müşteriye iade edildi` });
        }
        aciklama = aciklama || 'Müşteriye iade edildi';
        break;
      case 'ode': {
        const h = hesapGetir(g.hesap_id || cek.hesap_id, ['kasa', 'banka']);
        hesapHareket({ islem_id, hesap_id: h.id, tarih: t, tur: 'cek_odeme', cikis: cek.tutar,
          cari_id: cek.cari_id, aciklama: `${ad} ödendi${cari ? ' - ' + cari.unvan : ''}` });
        guncelle.hesap_id = h.id;
        aciklama = aciklama || `${h.ad} hesabından ödendi`;
        break;
      }
      case 'geri_al':
        if (cari) {
          cariHareket({ islem_id, cari_id: cari.id, tarih: t, tur: 'cek_iade', odeme_sekli: cek.tur,
            alacak: cek.tutar, cek_id: cek.id, aciklama: `${ad} tedarikçiden geri alındı` });
        }
        aciklama = aciklama || 'Tedarikçiden geri alındı';
        break;
    }

    const sets = Object.keys(guncelle).map((k) => `${k} = @${k}`).join(', ');
    db().prepare(`UPDATE cek_senet SET ${sets} WHERE id = @id`).run({ ...guncelle, id: cek.id });
    cekHareket(cek.id, islem_id, t, cek.durum, tanim.to, aciklama);
    return islem_id;
  });
}

/** Bir işlemi ve ürettiği tüm kayıtları geri alır. */
function islemIptal(id) {
  const islemId = Number(id);
  const islem = db().prepare('SELECT * FROM islemler WHERE id = ?').get(islemId);
  if (!islem) throw hata(404, 'İşlem bulunamadı');

  return tx(() => {
    // Bu işlemde oluşturulan çek/senetler sonradan başka bir işlem gördüyse iptal edilemez
    const olusan = db().prepare('SELECT id, no FROM cek_senet WHERE islem_id = ?').all(islemId);
    for (const c of olusan) {
      const baska = db().prepare('SELECT 1 FROM cek_hareketleri WHERE cek_id = ? AND islem_id != ?').get(c.id, islemId);
      if (baska) throw hata(400, `Evrak (No: ${c.no || '-'}) üzerinde sonradan işlem yapılmış. Önce o işlemi geri alın.`);
    }
    // Mevcut evrakların durumunu geri al
    const degisen = db().prepare(`SELECT ch.* FROM cek_hareketleri ch JOIN cek_senet c ON c.id = ch.cek_id
      WHERE ch.islem_id = ? AND (c.islem_id IS NULL OR c.islem_id != ?)`).all(islemId, islemId);
    for (const ch of degisen) {
      const son = db().prepare('SELECT islem_id FROM cek_hareketleri WHERE cek_id = ? ORDER BY id DESC LIMIT 1').get(ch.cek_id);
      if (son.islem_id !== islemId) throw hata(400, 'Evrak üzerinde daha sonra işlem yapılmış. Önce son işlemi geri alın.');
      const geri = { durum: ch.eski_durum };
      if (ch.eski_durum === 'portfoy') Object.assign(geri, { hesap_id: null, ciro_cari_id: null });
      if (ch.yeni_durum === 'ciro') geri.ciro_cari_id = null;
      const sets = Object.keys(geri).map((k) => `${k} = @${k}`).join(', ');
      db().prepare(`UPDATE cek_senet SET ${sets} WHERE id = @id`).run({ ...geri, id: ch.cek_id });
    }
    db().prepare('UPDATE faturalar SET iptal = 1 WHERE islem_id = ?').run(islemId);
    db().prepare('DELETE FROM islemler WHERE id = ?').run(islemId);
  });
}

module.exports = {
  ODEME_SEKILLERI, SEKIL_AD, tx, yeniIslem, cariGetir, hesapGetir, cariHareket, hesapHareket,
  odemeKaydet, dekontKaydet, hesapIslemi, cekIslemi, islemIptal, CEK_ISLEMLERI, zorunlu,
};
