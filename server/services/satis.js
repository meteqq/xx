// Perakende / hızlı satış: fiş + (varsa) tahsilat tek işlemde kaydedilir.
const { db } = require('../db');
const { hata, bugun, tutar, secenek } = require('../util');
const { tx, odemeKaydet } = require('./islem');
const { faturaKaydet } = require('./fatura');

const PESIN_KOD = 'PERAKENDE';

function pesinMusteri() {
  const c = db().prepare('SELECT * FROM cariler WHERE kod = ?').get(PESIN_KOD);
  if (c) return c;
  const id = db().prepare("INSERT INTO cariler (kod, unvan, tip) VALUES (?, 'Peşin Müşteri', 'musteri')").run(PESIN_KOD).lastInsertRowid;
  return db().prepare('SELECT * FROM cariler WHERE id = ?').get(id);
}

/** Tipi uygun ilk hesabı bulur; POS yoksa oluşturur. */
function varsayilanHesap(tip) {
  const h = db().prepare('SELECT id FROM hesaplar WHERE tip = ? AND aktif = 1 ORDER BY id LIMIT 1').get(tip);
  if (h) return h.id;
  if (tip === 'pos') return db().prepare("INSERT INTO hesaplar (tip, ad) VALUES ('pos', 'Kredi Kartı (POS)')").run().lastInsertRowid;
  throw hata(400, 'Kasa hesabı yok');
}

/**
 * g: { cari_id?, tarih?, aciklama?, kalemler: [{ urun_id?, aciklama, miktar, birim_fiyat (KDV dahil), kdv, iskonto? }],
 *      odeme: nakit | kredi_karti | veresiye | parcali, nakit?, kart? (parçalı tutarlar), hesap_id? }
 */
function satisKaydet(g) {
  const odeme = secenek(g.odeme, ['nakit', 'kredi_karti', 'veresiye', 'parcali'], 'Ödeme şekli');
  if (odeme === 'veresiye' && !g.cari_id) throw hata(400, 'Veresiye satış için müşteri seçin');
  const t = g.tarih || bugun();

  return tx(() => {
    const cari = g.cari_id ? db().prepare('SELECT * FROM cariler WHERE id = ?').get(g.cari_id) : pesinMusteri();
    if (!cari) throw hata(404, 'Müşteri bulunamadı');
    const kalemler = (Array.isArray(g.kalemler) ? g.kalemler : []).map((k) => ({ ...k, kdv_dahil: true }));
    const faturaId = faturaKaydet({ tur: 'satis', belge_tipi: 'fis', cari_id: cari.id, tarih: t, vade: t, aciklama: g.aciklama, kalemler });
    const f = db().prepare('SELECT no, genel_toplam FROM faturalar WHERE id = ?').get(faturaId);

    let satirlar = [];
    if (odeme === 'nakit') satirlar = [{ sekil: 'nakit', tutar: f.genel_toplam, hesap_id: g.hesap_id || varsayilanHesap('kasa') }];
    if (odeme === 'kredi_karti') satirlar = [{ sekil: 'kredi_karti', tutar: f.genel_toplam, hesap_id: g.hesap_id || varsayilanHesap('pos') }];
    if (odeme === 'parcali') {
      const nakit = tutar(g.nakit || 0, 'Nakit tutar', { sifirOlabilir: true });
      const kart = tutar(g.kart || 0, 'Kart tutarı', { sifirOlabilir: true });
      if (nakit + kart > f.genel_toplam) throw hata(400, 'Ödenen tutar satış toplamını aşıyor');
      if (nakit + kart < f.genel_toplam && cari.kod === PESIN_KOD) throw hata(400, 'Kalan tutar veresiye yazılacağı için müşteri seçin');
      if (nakit) satirlar.push({ sekil: 'nakit', tutar: nakit, hesap_id: varsayilanHesap('kasa') });
      if (kart) satirlar.push({ sekil: 'kredi_karti', tutar: kart, hesap_id: varsayilanHesap('pos') });
    }

    let tahsilatId = null;
    if (satirlar.length) {
      tahsilatId = odemeKaydet({ yon: 'tahsilat', cari_id: cari.id, tarih: t, belge_no: f.no, aciklama: `${f.no} satış`, satirlar });
      db().prepare('UPDATE faturalar SET tahsilat_islem_id = ? WHERE id = ?').run(tahsilatId, faturaId);
    }
    return { fatura_id: faturaId, no: f.no, toplam: f.genel_toplam, tahsilat_islem_id: tahsilatId };
  });
}

module.exports = { satisKaydet, pesinMusteri, PESIN_KOD };
