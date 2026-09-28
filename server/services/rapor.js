// Tüm raporlar aynı yapıda döner; bu yapı ekranda tablo, yazdırma ve Excel için ortak kullanılır:
// { baslik, alt, kolonlar: [{ key, label, type }], satirlar: [...], toplam: {...} }
const { db } = require('../db');
const { hata, bugun } = require('../util');
const { TURLER } = require('./fatura');
const { SEKIL_AD } = require('./islem');

const trTarih = (t) => (t ? t.split('-').reverse().join('.') : '');
const aralik = (p) => ({ bas: p.bas || '1900-01-01', bit: p.bit || '2999-12-31' });
const aralikYazi = (p) => (p.bas || p.bit ? `${trTarih(p.bas) || '...'} - ${trTarih(p.bit) || '...'}` : 'Tüm tarihler');

const CARI_TUR_AD = {
  acilis: 'Açılış', satis_fatura: 'Satış Faturası', alis_fatura: 'Alış Faturası', tahsilat: 'Tahsilat',
  odeme: 'Ödeme', satis_iade: 'Satış İade', alis_iade: 'Alış İade', cek_iade: 'Evrak İade', mahsup: 'Mahsup',
  borc_dekont: 'Borç Dekontu', alacak_dekont: 'Alacak Dekontu', aktarim: 'Netsis',
};
const HESAP_TIP_AD = { kasa: 'Kasa', banka: 'Banka', pos: 'POS', kart: 'Kredi Kartı' };
const CEK_DURUM_AD = {
  portfoy: 'Portföyde', tahsilde: 'Tahsilde', ciro: 'Ciro Edildi', tahsil: 'Tahsil Edildi',
  karsiliksiz: 'Karşılıksız', iade: 'İade', verildi: 'Ödenecek', odendi: 'Ödendi',
};

const para = (k) => (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const miktarYazi = (m) => (Number.isInteger(m) ? String(m) : String(Math.round(m * 1000) / 1000).replace('.', ','));

/** fatura id → "2 × Çimento, 1 × Kum +3" */
function urunOzeti(ids) {
  const ozet = new Map();
  if (!ids.length) return ozet;
  const kalemler = db().prepare(`SELECT fatura_id, aciklama, miktar FROM fatura_kalemleri
    WHERE fatura_id IN (SELECT value FROM json_each(?)) ORDER BY fatura_id, id`).all(JSON.stringify(ids));
  const grup = new Map();
  for (const k of kalemler) (grup.get(k.fatura_id) || grup.set(k.fatura_id, []).get(k.fatura_id)).push(k);
  for (const [id, ks] of grup) {
    const ilk = ks.slice(0, 2).map((k) => `${miktarYazi(k.miktar)} × ${k.aciklama}`).join(', ');
    ozet.set(id, ks.length > 2 ? `${ilk} +${ks.length - 2}` : ilk);
  }
  return ozet;
}

function ekstre(p) {
  const cari = db().prepare('SELECT * FROM cariler WHERE id = ?').get(p.cari_id);
  if (!cari) throw hata(404, 'Cari bulunamadı');
  const { bas, bit } = aralik(p);
  const devir = db().prepare('SELECT COALESCE(SUM(borc - alacak), 0) b FROM cari_hareketler WHERE cari_id = ? AND tarih < ?')
    .get(cari.id, bas).b;
  const rows = db().prepare(`SELECT * FROM cari_hareketler WHERE cari_id = ? AND tarih BETWEEN ? AND ?
    ORDER BY tarih, id`).all(cari.id, bas, bit);
  // Satışla birlikte alınan tahsilat ayrı satır olarak görünmez; fişin satırına işlenir (Satış Fişi · ürünler · Nakit)
  const faturaBilgi = new Map(db().prepare('SELECT id, belge_tipi, tahsilat_islem_id FROM faturalar WHERE cari_id = ?')
    .all(cari.id).map((f) => [f.id, f]));
  const fisTahsilat = new Map([...faturaBilgi.values()].filter((f) => f.tahsilat_islem_id).map((f) => [f.tahsilat_islem_id, f.id]));
  const ozet = urunOzeti(rows.map((r) => r.fatura_id).filter(Boolean));
  // Fişin satırı ekstrede varsa, ona ait ödeme satırları fişe katılır (sıradan bağımsız)
  const fisSatiri = new Set(rows.filter((r) => r.fatura_id).map((r) => `${r.fatura_id}|${r.tarih}`));
  const katilacak = new Map(); // fatura_id → ödeme satırları
  for (const r of rows) {
    const f = fisTahsilat.get(r.islem_id);
    if (f && fisSatiri.has(`${f}|${r.tarih}`)) (katilacak.get(f) || katilacak.set(f, []).get(f)).push(r);
  }
  let bakiye = devir;
  const satirlar = [];
  if (p.bas) satirlar.push({ tarih: p.bas, tur: 'Devir', aciklama: 'Önceki dönemden devir', borc: devir > 0 ? devir : 0, alacak: devir < 0 ? -devir : 0, bakiye: devir });
  let tb = devir > 0 ? devir : 0;
  let ta = devir < 0 ? -devir : 0;
  for (const r of rows) {
    const bagliFis = fisTahsilat.get(r.islem_id);
    if (bagliFis && katilacak.get(bagliFis)?.includes(r)) continue;
    const odemeler = r.fatura_id ? katilacak.get(r.fatura_id) || [] : [];
    const borc = r.borc + odemeler.reduce((a, x) => a + x.borc, 0);
    const alacak = r.alacak + odemeler.reduce((a, x) => a + x.alacak, 0);
    bakiye += borc - alacak;
    tb += borc;
    ta += alacak;
    const fis = r.fatura_id && faturaBilgi.get(r.fatura_id)?.belge_tipi === 'fis';
    satirlar.push({
      id: r.id, islem_id: r.islem_id, fatura_id: r.fatura_id || bagliFis || null, cek_id: r.cek_id,
      tarih: r.tarih, vade: fis ? null : r.vade, belge_no: r.belge_no,
      tur: fis ? (r.tur === 'satis_fatura' ? 'Satış Fişi' : 'İade Fişi') : CARI_TUR_AD[r.tur] || r.tur,
      odeme_sekli: r.odeme_sekli ? SEKIL_AD[r.odeme_sekli] : '',
      aciklama: r.fatura_id && ozet.has(r.fatura_id) ? (fis ? ozet.get(r.fatura_id) : `${r.aciklama || ''} · ${ozet.get(r.fatura_id)}`) : r.aciklama,
      borc, alacak, bakiye, sekiller: odemeler.map((x) => SEKIL_AD[x.odeme_sekli] || 'Diğer'),
    });
  }
  for (const x of satirlar) {
    if (x.tur === 'Satış Fişi' && !x.sekiller.length) x.aciklama = `${x.aciklama} · Veresiye`;
    else if (x.sekiller?.length) {
      const odenen = x.alacak;
      x.aciklama = `${x.aciklama} · ${[...new Set(x.sekiller)].join(' + ')}${odenen < x.borc ? ` (kalan ${para(x.borc - odenen)} veresiye)` : ''}`;
    }
    delete x.sekiller;
  }
  return {
    baslik: `Cari Hesap Ekstresi - ${cari.unvan}`,
    alt: aralikYazi(p),
    cari,
    kolonlar: [
      { key: 'tarih', label: 'Tarih', type: 'date' },
      { key: 'tur', label: 'İşlem' },
      { key: 'belge_no', label: 'Belge No' },
      { key: 'aciklama', label: 'Açıklama' },
      { key: 'vade', label: 'Vade', type: 'date' },
      { key: 'borc', label: 'Borç', type: 'money' },
      { key: 'alacak', label: 'Alacak', type: 'money' },
      { key: 'bakiye', label: 'Bakiye', type: 'bakiye' },
    ],
    satirlar,
    toplam: { borc: tb, alacak: ta, bakiye },
  };
}

function bakiyeListesi(p) {
  const kosul = [];
  if (p.tip === 'musteri') kosul.push("c.tip IN ('musteri','her_ikisi')");
  if (p.tip === 'tedarikci') kosul.push("c.tip IN ('tedarikci','her_ikisi')");
  if (p.pasif !== '1') kosul.push('c.aktif = 1');
  const rows = db().prepare(`SELECT c.id, c.kod, c.unvan, c.telefon, c.il, c.risk_limiti, c.doviz,
      COALESCE(SUM(h.borc), 0) borc, COALESCE(SUM(h.alacak), 0) alacak,
      COALESCE(SUM(h.borc - h.alacak), 0) bakiye
    FROM cariler c LEFT JOIN cari_hareketler h ON h.cari_id = c.id AND h.tarih <= ?
    ${kosul.length ? 'WHERE ' + kosul.join(' AND ') : ''}
    GROUP BY c.id ORDER BY bakiye DESC`).all(p.bit || '2999-12-31');
  let satirlar = rows;
  if (p.durum === 'borclu') satirlar = rows.filter((r) => r.bakiye > 0);
  if (p.durum === 'alacakli') satirlar = rows.filter((r) => r.bakiye < 0);
  if (p.durum === 'bakiyeli') satirlar = rows.filter((r) => r.bakiye !== 0);
  const top = (k) => satirlar.reduce((a, r) => a + r[k], 0);
  return {
    baslik: 'Cari Bakiye Listesi',
    alt: p.bit ? `${trTarih(p.bit)} itibarıyla` : `${trTarih(bugun())} itibarıyla`,
    kolonlar: [
      { key: 'kod', label: 'Kod' },
      { key: 'unvan', label: 'Ünvan', link: 'cari' },
      { key: 'telefon', label: 'Telefon' },
      { key: 'il', label: 'İl' },
      { key: 'borc', label: 'Toplam Borç', type: 'money' },
      { key: 'alacak', label: 'Toplam Alacak', type: 'money' },
      { key: 'bakiye', label: 'Bakiye', type: 'bakiye' },
    ],
    satirlar,
    toplam: { borc: top('borc'), alacak: top('alacak'), bakiye: top('bakiye') },
  };
}

/** FIFO yöntemiyle açık alacakları vadesine göre yaşlandırır. */
function hesapDefteri(p) {
  const hesap = db().prepare('SELECT * FROM hesaplar WHERE id = ?').get(p.hesap_id);
  if (!hesap) throw hata(404, 'Hesap bulunamadı');
  const { bas, bit } = aralik(p);
  const devir = db().prepare('SELECT COALESCE(SUM(giris - cikis), 0) b FROM hesap_hareketleri WHERE hesap_id = ? AND tarih < ?').get(hesap.id, bas).b;
  const rows = db().prepare(`SELECT h.*, c.unvan FROM hesap_hareketleri h LEFT JOIN cariler c ON c.id = h.cari_id
    WHERE h.hesap_id = ? AND h.tarih BETWEEN ? AND ? ORDER BY h.tarih, h.id`).all(hesap.id, bas, bit);
  let bakiye = devir;
  let tg = 0;
  let tc = 0;
  const satirlar = p.bas ? [{ tarih: p.bas, aciklama: 'Devir', giris: devir > 0 ? devir : 0, cikis: devir < 0 ? -devir : 0, bakiye: devir }] : [];
  for (const r of rows) {
    bakiye += r.giris - r.cikis;
    tg += r.giris;
    tc += r.cikis;
    satirlar.push({ id: r.id, islem_id: r.islem_id, cari_id: r.cari_id, tarih: r.tarih, valor: r.valor,
      aciklama: r.aciklama, kategori: r.kategori, giris: r.giris, cikis: r.cikis, bakiye });
  }
  return {
    baslik: `${HESAP_TIP_AD[hesap.tip]} Defteri - ${hesap.ad}`,
    alt: aralikYazi(p),
    hesap,
    kolonlar: [
      { key: 'tarih', label: 'Tarih', type: 'date' },
      ...(hesap.tip === 'pos' ? [{ key: 'valor', label: 'Valör', type: 'date' }] : []),
      { key: 'aciklama', label: 'Açıklama' },
      { key: 'kategori', label: 'Kategori' },
      { key: 'giris', label: 'Giriş', type: 'money' },
      { key: 'cikis', label: 'Çıkış', type: 'money' },
      { key: 'bakiye', label: 'Bakiye', type: 'money' },
    ],
    satirlar,
    toplam: { giris: tg, cikis: tc, bakiye },
  };
}

function cekListesi(p) {
  const kosul = ['1=1'];
  const par = {};
  if (p.yon) { kosul.push('c.yon = @yon'); par.yon = p.yon; }
  if (p.tur) { kosul.push('c.tur = @tur'); par.tur = p.tur; }
  if (p.durum === 'acik') kosul.push("c.durum IN ('portfoy','tahsilde','verildi')");
  else if (p.durum) { kosul.push('c.durum = @durum'); par.durum = p.durum; }
  if (p.bas) { kosul.push('c.vade >= @bas'); par.bas = p.bas; }
  if (p.bit) { kosul.push('c.vade <= @bit'); par.bit = p.bit; }
  if (p.cari_id) { kosul.push('(c.cari_id = @cari_id OR c.ciro_cari_id = @cari_id)'); par.cari_id = p.cari_id; }
  if (p.q) { kosul.push("(c.no LIKE @q OR c.kesideci LIKE @q OR c.banka LIKE @q OR ca.unvan LIKE @q)"); par.q = `%${p.q}%`; }
  const rows = db().prepare(`SELECT c.*, ca.unvan cari_unvan, cc.unvan ciro_unvan, h.ad hesap_ad
    FROM cek_senet c LEFT JOIN cariler ca ON ca.id = c.cari_id LEFT JOIN cariler cc ON cc.id = c.ciro_cari_id
    LEFT JOIN hesaplar h ON h.id = c.hesap_id WHERE ${kosul.join(' AND ')} ORDER BY c.vade, c.id`).all(par);
  const bugunT = bugun();
  const satirlar = rows.map((r) => ({
    ...r,
    tur_ad: r.tur === 'cek' ? 'Çek' : 'Senet',
    yon_ad: r.yon === 'alinan' ? 'Alınan' : 'Verilen',
    durum_ad: CEK_DURUM_AD[r.durum] || r.durum,
    kalan_gun: Math.round((Date.parse(r.vade) - Date.parse(bugunT)) / 864e5),
  }));
  return {
    baslik: 'Çek / Senet Listesi',
    alt: aralikYazi(p),
    kolonlar: [
      { key: 'vade', label: 'Vade', type: 'date' },
      { key: 'tur_ad', label: 'Tür' },
      { key: 'yon_ad', label: 'Yön' },
      { key: 'no', label: 'No' },
      { key: 'banka', label: 'Banka' },
      { key: 'kesideci', label: 'Keşideci/Borçlu' },
      { key: 'cari_unvan', label: 'Cari' },
      { key: 'durum_ad', label: 'Durum' },
      { key: 'tutar', label: 'Tutar', type: 'money' },
    ],
    satirlar,
    toplam: { tutar: satirlar.reduce((a, r) => a + r.tutar, 0) },
  };
}

function stokDurum(p) {
  const rows = db().prepare(`SELECT u.*, COALESCE(SUM(s.giris), 0) giris, COALESCE(SUM(s.cikis), 0) cikis,
      COALESCE(SUM(s.giris - s.cikis), 0) miktar
    FROM urunler u LEFT JOIN stok_hareketleri s ON s.urun_id = u.id AND s.tarih <= ?
    WHERE u.aktif = 1 GROUP BY u.id ORDER BY u.ad`).all(p.bit || '2999-12-31');
  let satirlar = rows.map((r) => ({ ...r, deger: Math.round(r.miktar * r.alis_fiyat), kritik: r.miktar <= r.kritik_stok ? 'Evet' : '' }));
  if (p.durum === 'kritik') satirlar = satirlar.filter((r) => r.kritik);
  return {
    baslik: 'Stok Durum Raporu',
    alt: p.bit ? `${trTarih(p.bit)} itibarıyla` : '',
    kolonlar: [
      { key: 'kod', label: 'Kod' },
      { key: 'ad', label: 'Ürün' },
      { key: 'birim', label: 'Birim' },
      { key: 'giris', label: 'Giriş', type: 'number' },
      { key: 'cikis', label: 'Çıkış', type: 'number' },
      { key: 'miktar', label: 'Mevcut', type: 'number' },
      { key: 'alis_fiyat', label: 'Alış Fiyatı', type: 'money' },
      { key: 'deger', label: 'Stok Değeri', type: 'money' },
      { key: 'kritik', label: 'Kritik' },
    ],
    satirlar,
    toplam: { deger: satirlar.reduce((a, r) => a + r.deger, 0) },
  };
}

function faturaOzet(p) {
  const { bas, bit } = aralik(p);
  const tur = p.tur || 'satis';
  if (!TURLER[tur]) throw hata(400, 'Fatura türü geçersiz');
  const satirlar = db().prepare(`SELECT c.id, c.kod, c.unvan, COUNT(*) adet, SUM(f.ara_toplam - f.iskonto) net,
      SUM(f.kdv_toplam) kdv, SUM(f.genel_toplam) toplam
    FROM faturalar f JOIN cariler c ON c.id = f.cari_id
    WHERE f.iptal = 0 AND f.tur = ? AND f.tarih BETWEEN ? AND ? GROUP BY c.id ORDER BY toplam DESC`).all(tur, bas, bit);
  const top = (k) => satirlar.reduce((a, r) => a + r[k], 0);
  return {
    baslik: `${TURLER[tur].ad} Özeti (Cari Bazında)`,
    alt: aralikYazi(p),
    kolonlar: [
      { key: 'kod', label: 'Kod' },
      { key: 'unvan', label: 'Ünvan', link: 'cari' },
      { key: 'adet', label: 'Fatura Adedi', type: 'number' },
      { key: 'net', label: 'Net Tutar', type: 'money' },
      { key: 'kdv', label: 'KDV', type: 'money' },
      { key: 'toplam', label: 'Genel Toplam', type: 'money' },
    ],
    satirlar,
    toplam: { adet: top('adet'), net: top('net'), kdv: top('kdv'), toplam: top('toplam') },
  };
}

function urunSatis(p) {
  const { bas, bit } = aralik(p);
  const cari = p.cari_id ? db().prepare('SELECT * FROM cariler WHERE id = ?').get(p.cari_id) : null;
  if (p.cari_id && !cari) throw hata(404, 'Cari bulunamadı');
  const alis = cari?.tip === 'tedarikci';
  const [ana, iade] = alis ? ['alis', 'alis_iade'] : ['satis', 'satis_iade'];
  const satirlar = db().prepare(`SELECT MIN(k.urun_id) urun_id, COALESCE(u.kod, '') kod, k.aciklama ad, k.birim,
      SUM(CASE WHEN f.tur = @ana THEN k.miktar ELSE -k.miktar END) miktar,
      SUM(CASE WHEN f.tur = @ana THEN k.tutar ELSE -k.tutar END) tutar,
      SUM(CASE WHEN f.tur = @ana THEN k.tutar + k.kdv_tutar ELSE -(k.tutar + k.kdv_tutar) END) toplam,
      MAX(f.tarih) son_tarih, COUNT(DISTINCT f.id) adet
    FROM fatura_kalemleri k JOIN faturalar f ON f.id = k.fatura_id LEFT JOIN urunler u ON u.id = k.urun_id
    WHERE f.iptal = 0 AND f.tur IN (@ana, @iade) AND f.tarih BETWEEN @bas AND @bit ${cari ? 'AND f.cari_id = @cari' : ''}
    GROUP BY COALESCE(k.urun_id, k.aciklama) ORDER BY ${cari ? 'son_tarih DESC, toplam DESC' : 'tutar DESC'}`)
    .all({ ana, iade, bas, bit, cari: cari?.id });
  if (cari) {
    return {
      baslik: `${alis ? 'Alınan' : 'Verilen'} Ürünler - ${cari.unvan}`,
      alt: aralikYazi(p) + ' (iadeler düşülmüş, KDV dahil)',
      kolonlar: [
        { key: 'ad', label: 'Ürün / Hizmet' },
        { key: 'miktar', label: 'Miktar', type: 'number' },
        { key: 'birim', label: 'Birim' },
        { key: 'son_tarih', label: 'Son Tarih', type: 'date' },
        { key: 'toplam', label: 'Tutar', type: 'money' },
      ],
      satirlar,
      toplam: { toplam: satirlar.reduce((a, r) => a + r.toplam, 0) },
    };
  }
  return {
    baslik: 'Ürün Bazında Satış Raporu',
    alt: aralikYazi(p) + ' (iadeler düşülmüş, KDV hariç)',
    kolonlar: [
      { key: 'kod', label: 'Kod' },
      { key: 'ad', label: 'Ürün / Hizmet' },
      { key: 'miktar', label: 'Miktar', type: 'number' },
      { key: 'birim', label: 'Birim' },
      { key: 'tutar', label: 'Tutar', type: 'money' },
    ],
    satirlar,
    toplam: { tutar: satirlar.reduce((a, r) => a + r.tutar, 0) },
  };
}

/** Bir carinin belirli bir ürünü hangi fiş/faturayla, ne zaman, kaç adet aldığı */
function cariUrunHareket(cariId, { urun_id: urunId, ad, bas, bit } = {}) {
  const a = aralik({ bas, bit });
  return db().prepare(`SELECT f.id fatura_id, f.no, f.tarih, f.tur, f.belge_tipi, k.aciklama ad, k.birim,
      CASE WHEN f.tur LIKE '%iade' THEN -k.miktar ELSE k.miktar END miktar,
      ROUND((k.tutar + k.kdv_tutar) * 1.0 / k.miktar) birim_fiyat,
      CASE WHEN f.tur LIKE '%iade' THEN -(k.tutar + k.kdv_tutar) ELSE k.tutar + k.kdv_tutar END toplam
    FROM fatura_kalemleri k JOIN faturalar f ON f.id = k.fatura_id
    WHERE f.iptal = 0 AND f.cari_id = ? AND f.tarih BETWEEN ? AND ?
      AND ${urunId ? 'k.urun_id = ?' : 'k.urun_id IS NULL AND k.aciklama = ?'}
    ORDER BY f.tarih DESC, f.id DESC`).all(cariId, a.bas, a.bit, urunId ? Number(urunId) : ad);
}

function gelirGider(p) {
  const { bas, bit } = aralik(p);
  const satirlar = db().prepare(`SELECT COALESCE(kategori, CASE tur WHEN 'gelir' THEN 'Diğer Gelir' ELSE 'Diğer Gider' END) kategori,
      SUM(giris) gelir, SUM(cikis) gider, COUNT(*) adet
    FROM hesap_hareketleri WHERE tur IN ('gelir','gider','komisyon') AND tarih BETWEEN ? AND ?
    GROUP BY 1 ORDER BY gider DESC, gelir DESC`).all(bas, bit);
  const g = satirlar.reduce((a, r) => a + r.gelir, 0);
  const c = satirlar.reduce((a, r) => a + r.gider, 0);
  return {
    baslik: 'Gelir / Gider Raporu (Kategori Bazında)',
    alt: aralikYazi(p),
    kolonlar: [
      { key: 'kategori', label: 'Kategori' },
      { key: 'adet', label: 'Adet', type: 'number' },
      { key: 'gelir', label: 'Gelir', type: 'money' },
      { key: 'gider', label: 'Gider', type: 'money' },
    ],
    satirlar,
    toplam: { gelir: g, gider: c, kategori: `Net: ${((g - c) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
  };
}

function kasaOzet() {
  const satirlar = db().prepare(`SELECT h.id, h.tip, h.ad, h.banka_adi, h.iban, h.doviz, COALESCE(SUM(x.giris - x.cikis), 0) bakiye
    FROM hesaplar h LEFT JOIN hesap_hareketleri x ON x.hesap_id = h.id WHERE h.aktif = 1
    GROUP BY h.id ORDER BY CASE h.tip WHEN 'kasa' THEN 1 WHEN 'banka' THEN 2 WHEN 'pos' THEN 3 ELSE 4 END, h.ad`).all()
    .map((r) => ({ ...r, tip_ad: HESAP_TIP_AD[r.tip] }));
  return {
    baslik: 'Kasa / Banka Bakiyeleri',
    alt: `${trTarih(bugun())} itibarıyla`,
    kolonlar: [
      { key: 'tip_ad', label: 'Tür' },
      { key: 'ad', label: 'Hesap' },
      { key: 'banka_adi', label: 'Banka' },
      { key: 'iban', label: 'IBAN' },
      { key: 'doviz', label: 'Döviz' },
      { key: 'bakiye', label: 'Bakiye', type: 'money' },
    ],
    satirlar,
    toplam: { bakiye: satirlar.filter((r) => r.doviz === 'TRY').reduce((a, r) => a + r.bakiye, 0) },
  };
}

/** Günün satış, tahsilat, masraf ve kasa özeti */
function gunSonu(p) {
  const t = p.tarih || bugun();
  const d = db();
  const satis = d.prepare(`SELECT COUNT(*) adet, COALESCE(SUM(genel_toplam), 0) toplam FROM faturalar
    WHERE iptal = 0 AND tur = 'satis' AND tarih = ?`).get(t);
  const iade = d.prepare(`SELECT COUNT(*) adet, COALESCE(SUM(genel_toplam), 0) toplam FROM faturalar
    WHERE iptal = 0 AND tur = 'satis_iade' AND tarih = ?`).get(t);
  const pesinTahsil = d.prepare(`SELECT COALESCE(SUM(h.alacak), 0) t FROM faturalar f JOIN cari_hareketler h ON h.islem_id = f.tahsilat_islem_id
    WHERE f.iptal = 0 AND f.tur = 'satis' AND f.tarih = ?`).get(t).t;
  const tahsilat = d.prepare(`SELECT odeme_sekli, SUM(alacak) t FROM cari_hareketler WHERE tur = 'tahsilat' AND tarih = ?
    GROUP BY odeme_sekli ORDER BY t DESC`).all(t);
  const odeme = d.prepare("SELECT COALESCE(SUM(borc), 0) t FROM cari_hareketler WHERE tur = 'odeme' AND tarih = ?").get(t).t;
  const masraf = d.prepare("SELECT COALESCE(SUM(cikis), 0) t FROM hesap_hareketleri WHERE tur IN ('gider','komisyon') AND tarih = ?").get(t).t;
  const kasa = d.prepare(`SELECT COALESCE(SUM(CASE WHEN x.tarih < @t THEN x.giris - x.cikis END), 0) devir,
      COALESCE(SUM(CASE WHEN x.tarih = @t THEN x.giris END), 0) giris, COALESCE(SUM(CASE WHEN x.tarih = @t THEN x.cikis END), 0) cikis
    FROM hesap_hareketleri x JOIN hesaplar h ON h.id = x.hesap_id WHERE h.tip = 'kasa' AND x.tarih <= @t`).get({ t });

  const satirlar = [
    { kalem: `Satış (${satis.adet} adet)`, tutar: satis.toplam, grup: 'Satış' },
    { kalem: 'Peşin tahsil edilen', tutar: pesinTahsil, grup: 'Satış' },
    { kalem: 'Veresiye', tutar: satis.toplam - pesinTahsil, grup: 'Satış' },
    ...(iade.adet ? [{ kalem: `İade (${iade.adet} adet)`, tutar: -iade.toplam, grup: 'Satış' }] : []),
    ...tahsilat.map((x) => ({ kalem: `Tahsilat - ${SEKIL_AD[x.odeme_sekli] || 'Diğer'}`, tutar: x.t, grup: 'Tahsilat' })),
    ...(odeme ? [{ kalem: 'Yapılan ödemeler', tutar: -odeme, grup: 'Ödeme' }] : []),
    ...(masraf ? [{ kalem: 'Masraflar', tutar: -masraf, grup: 'Ödeme' }] : []),
    { kalem: 'Kasa devir', tutar: kasa.devir, grup: 'Kasa' },
    { kalem: 'Kasa giriş', tutar: kasa.giris, grup: 'Kasa' },
    { kalem: 'Kasa çıkış', tutar: -kasa.cikis, grup: 'Kasa' },
    { kalem: 'Kasada olması gereken', tutar: kasa.devir + kasa.giris - kasa.cikis, grup: 'Kasa', vurgu: true },
  ];
  return {
    baslik: 'Gün Sonu',
    alt: trTarih(t),
    kolonlar: [{ key: 'grup', label: 'Grup' }, { key: 'kalem', label: 'Kalem' }, { key: 'tutar', label: 'Tutar', type: 'money' }],
    satirlar,
  };
}

const RAPORLAR = {
  gunsonu: gunSonu,
  ekstre, bakiye: bakiyeListesi, hesap: hesapDefteri, cek: cekListesi, stok: stokDurum,
  fatura: faturaOzet, urun: urunSatis, gelirgider: gelirGider, kasa: kasaOzet,
};

function rapor(ad, p) {
  const fn = RAPORLAR[ad];
  if (!fn) throw hata(404, 'Rapor bulunamadı');
  return fn(p || {});
}

module.exports = { rapor, cariUrunHareket, CARI_TUR_AD, HESAP_TIP_AD, CEK_DURUM_AD, trTarih };
