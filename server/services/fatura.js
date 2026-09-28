const { db } = require('../db');
const { hata, bugun, gunEkle, tarih, secenek } = require('../util');
const { tx, yeniIslem, cariGetir, cariHareket, islemIptal } = require('./islem');

const TURLER = {
  satis:      { ad: 'Satış Faturası', cari: 'borc', stok: 'cikis', cariTur: 'satis_fatura', stokTur: 'satis' },
  alis:       { ad: 'Alış Faturası', cari: 'alacak', stok: 'giris', cariTur: 'alis_fatura', stokTur: 'alis' },
  satis_iade: { ad: 'Satış İade Faturası', cari: 'alacak', stok: 'giris', cariTur: 'satis_iade', stokTur: 'satis_iade' },
  alis_iade:  { ad: 'Alış İade Faturası', cari: 'borc', stok: 'cikis', cariTur: 'alis_iade', stokTur: 'alis_iade' },
};

function kalemHesapla(k) {
  const miktar = Number(k.miktar);
  const fiyat = Number(k.birim_fiyat);
  const isk = Number(k.iskonto || 0);
  const kdv = Number(k.kdv ?? 20);
  if (!String(k.aciklama || '').trim()) throw hata(400, 'Kalem açıklaması gerekli');
  if (!Number.isFinite(miktar) || miktar <= 0) throw hata(400, `"${k.aciklama}" için miktar geçersiz`);
  if (!Number.isInteger(fiyat) || fiyat < 0) throw hata(400, `"${k.aciklama}" için fiyat geçersiz`);
  if (!(isk >= 0 && isk < 100)) throw hata(400, 'İskonto 0-99 arasında olmalı');
  if (!(kdv >= 0 && kdv <= 100)) throw hata(400, 'KDV oranı geçersiz');
  const ortak = { urun_id: k.urun_id || null, aciklama: String(k.aciklama).trim(), miktar, birim: k.birim || 'Adet', iskonto: isk, kdv };
  if (k.kdv_dahil) {
    // Perakende: fiyat KDV dahil girilir, satır toplamı kuruşu kuruşuna korunur
    const dahil = Math.round(miktar * fiyat * (1 - isk / 100));
    const kdvTutar = Math.round(dahil * kdv / (100 + kdv));
    const tutar = dahil - kdvTutar;
    return { ...ortak, birim_fiyat: Math.round(fiyat / (1 + kdv / 100)), brut: isk ? Math.round(tutar / (1 - isk / 100)) : tutar, tutar, kdv_tutar: kdvTutar };
  }
  const brut = Math.round(miktar * fiyat);
  const tutar = Math.round(brut * (1 - isk / 100));
  return { ...ortak, birim_fiyat: fiyat, brut, tutar, kdv_tutar: Math.round(tutar * kdv / 100) };
}

function sonrakiNo(tur, belgeTipi = 'fatura') {
  const seri = db().prepare("SELECT deger FROM ayarlar WHERE anahtar = 'fatura_seri'").get()?.deger || 'FTR';
  const onEk = belgeTipi === 'fis' ? 'FIS' : tur === 'satis' ? seri : tur.toUpperCase().slice(0, 3);
  const on = `${onEk}${new Date().getFullYear()}`;
  const son = db().prepare("SELECT no FROM faturalar WHERE no LIKE ? || '%' ORDER BY length(no) DESC, no DESC LIMIT 1").get(on);
  const sira = son ? (parseInt(son.no.slice(on.length), 10) || 0) + 1 : 1;
  return on + String(sira).padStart(6, '0');
}

function faturaKaydet(g, mevcutId = null) {
  const tur = secenek(g.tur, Object.keys(TURLER), 'Fatura türü');
  const belgeTipi = g.belge_tipi === 'fis' ? 'fis' : 'fatura';
  const tanim = TURLER[tur];
  const cari = cariGetir(g.cari_id);
  const t = tarih(g.tarih || bugun());
  const vade = tarih(g.vade, 'Vade', { bos: true }) || gunEkle(t, cari.vade_gun);
  const kalemler = (Array.isArray(g.kalemler) ? g.kalemler : []).map(kalemHesapla);
  if (!kalemler.length) throw hata(400, 'Faturaya en az bir kalem ekleyin');

  const ara = kalemler.reduce((a, k) => a + k.brut, 0);
  const net = kalemler.reduce((a, k) => a + k.tutar, 0);
  const kdvT = kalemler.reduce((a, k) => a + k.kdv_tutar, 0);
  const genel = net + kdvT;

  return tx(() => {
    let no = g.no && String(g.no).trim();
    if (mevcutId) {
      const eski = db().prepare('SELECT * FROM faturalar WHERE id = ?').get(mevcutId);
      if (!eski || eski.iptal) throw hata(404, 'Fatura bulunamadı');
      if (eski.kaynak === 'netsis') throw hata(400, 'Netsis\'ten aktarılan faturalar değiştirilemez');
      if (eski.islem_id) islemIptal(eski.islem_id);
      db().prepare('DELETE FROM faturalar WHERE id = ?').run(mevcutId);
      no = no || eski.no;
    }
    no = no || sonrakiNo(tur, belgeTipi);
    const cakisan = db().prepare('SELECT 1 FROM faturalar WHERE no = ? AND tur = ? AND iptal = 0').get(no, tur);
    if (cakisan) throw hata(400, `${no} numaralı fatura zaten var`);

    const islem_id = yeniIslem('fatura', t, g.aciklama, no);
    const fatura_id = db().prepare(`INSERT INTO faturalar
      (${mevcutId ? 'id, ' : ''}islem_id, tur, belge_tipi, no, cari_id, tarih, vade, ara_toplam, iskonto, kdv_toplam, genel_toplam, aciklama)
      VALUES (${mevcutId ? '@id, ' : ''}@islem_id, @tur, @belge_tipi, @no, @cari_id, @tarih, @vade, @ara, @isk, @kdv, @genel, @aciklama)`)
      .run({ id: mevcutId, islem_id, tur, belge_tipi: belgeTipi, no, cari_id: cari.id, tarih: t, vade, ara, isk: ara - net, kdv: kdvT, genel,
        aciklama: g.aciklama || null }).lastInsertRowid;

    const kalemEkle = db().prepare(`INSERT INTO fatura_kalemleri
      (fatura_id, urun_id, aciklama, miktar, birim, birim_fiyat, iskonto, kdv, tutar, kdv_tutar)
      VALUES (@fatura_id, @urun_id, @aciklama, @miktar, @birim, @birim_fiyat, @iskonto, @kdv, @tutar, @kdv_tutar)`);
    const stokEkle = db().prepare(`INSERT INTO stok_hareketleri
      (islem_id, urun_id, tarih, tur, giris, cikis, birim_fiyat, fatura_id, aciklama)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const k of kalemler) {
      if (k.urun_id && !db().prepare('SELECT 1 FROM urunler WHERE id = ?').get(k.urun_id)) throw hata(400, 'Ürün bulunamadı');
      kalemEkle.run({ ...k, fatura_id });
      if (k.urun_id) {
        stokEkle.run(islem_id, k.urun_id, t, tanim.stokTur, tanim.stok === 'giris' ? k.miktar : 0,
          tanim.stok === 'cikis' ? k.miktar : 0, Math.round(k.tutar / k.miktar), fatura_id, `${no} - ${cari.unvan}`);
      }
    }
    cariHareket({ islem_id, cari_id: cari.id, tarih: t, vade, tur: tanim.cariTur, [tanim.cari]: genel,
      aciklama: `${belgeTipi === 'fis' ? 'Satış fişi' : tanim.ad}${g.aciklama ? ' - ' + g.aciklama : ''}`, belge_no: no, fatura_id });
    return fatura_id;
  });
}

function faturaGetir(id) {
  const f = db().prepare(`SELECT f.*, c.unvan, c.adres, c.il, c.ilce, c.vergi_dairesi, c.vergi_no, c.tc_no, c.telefon
    FROM faturalar f JOIN cariler c ON c.id = f.cari_id WHERE f.id = ?`).get(id);
  if (!f) throw hata(404, 'Fatura bulunamadı');
  f.kalemler = db().prepare('SELECT * FROM fatura_kalemleri WHERE fatura_id = ? ORDER BY id').all(id);
  f.tur_ad = f.belge_tipi === 'fis' ? 'Satış Fişi' : TURLER[f.tur].ad;
  return f;
}

module.exports = { TURLER, faturaKaydet, faturaGetir, sonrakiNo, kalemHesapla };
