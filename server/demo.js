// Programı denemek için örnek veri oluşturur: npm run demo
const { db, open } = require('./db');
const { odemeKaydet, hesapIslemi, cekIslemi, dekontKaydet } = require('./services/islem');
const { faturaKaydet } = require('./services/fatura');
const { gunEkle, bugun } = require('./util');

open();
if (db().prepare('SELECT COUNT(*) n FROM cariler').get().n && !process.argv.includes('--force')) {
  console.log('Veritabanında zaten kayıt var. Yine de eklemek için: npm run demo -- --force');
  process.exit(0);
}

const t = bugun();
const g = (n) => gunEkle(t, n);
const ins = (tablo, v) => {
  const k = Object.keys(v);
  return Number(db().prepare(`INSERT INTO ${tablo} (${k.join(',')}) VALUES (${k.map((x) => '@' + x).join(',')})`).run(v).lastInsertRowid);
};

db().prepare("UPDATE ayarlar SET deger = 'Örnek Ticaret Ltd. Şti.' WHERE anahtar = 'firma_unvan'").run();
const set = db().prepare('INSERT OR REPLACE INTO ayarlar (anahtar, deger) VALUES (?, ?)');
set.run('firma_adres', 'Atatürk Cad. No:12 Merkez / Ankara');
set.run('firma_telefon', '0312 000 00 00');
set.run('firma_vergi_dairesi', 'Çankaya');
set.run('firma_vergi_no', '1234567890');

const kasa = db().prepare("SELECT id FROM hesaplar WHERE tip = 'kasa' LIMIT 1").get().id;
const ziraat = ins('hesaplar', { tip: 'banka', ad: 'Ziraat TL', banka_adi: 'Ziraat Bankası', iban: 'TR12 0001 0000 0000 0000 0000 01' });
const garanti = ins('hesaplar', { tip: 'banka', ad: 'Garanti TL', banka_adi: 'Garanti BBVA', iban: 'TR34 0006 2000 0000 0000 0000 02' });
const pos = ins('hesaplar', { tip: 'pos', ad: 'Ziraat POS', banka_adi: 'Ziraat Bankası', komisyon: 1.8, valor_gun: 1 });
const kart = ins('hesaplar', { tip: 'kart', ad: 'Firma Kredi Kartı', banka_adi: 'Garanti BBVA' });
hesapIslemi({ tur: 'acilis', hesap_id: kasa, tutar: 1500000, tarih: g(-90) });
hesapIslemi({ tur: 'acilis', hesap_id: ziraat, tutar: 8500000, tarih: g(-90) });
hesapIslemi({ tur: 'acilis', hesap_id: garanti, tutar: 3200000, tarih: g(-90) });

const cari = (v) => ins('cariler', { tip: 'musteri', vade_gun: 30, ...v });
const m1 = cari({ kod: 'C00001', unvan: 'Yılmaz Yapı Market', yetkili: 'Mehmet Yılmaz', telefon: '0532 111 22 33', il: 'Ankara', ilce: 'Çankaya', vergi_dairesi: 'Çankaya', vergi_no: '9876543210', risk_limiti: 5000000, grup: 'Bayi' });
const m2 = cari({ kod: 'C00002', unvan: 'Demir İnşaat A.Ş.', yetkili: 'Ayşe Demir', telefon: '0533 222 33 44', il: 'İstanbul', ilce: 'Kadıköy', vade_gun: 60, risk_limiti: 3000000 });
const m3 = cari({ kod: 'C00003', unvan: 'Kaya Elektrik', yetkili: 'Ali Kaya', telefon: '0542 333 44 55', il: 'İzmir', iskonto: 5 });
const m4 = cari({ kod: 'C00004', unvan: 'Ahmet Çelik', telefon: '0555 444 55 66', il: 'Ankara', vade_gun: 0 });
const t1 = cari({ kod: 'C00005', unvan: 'Anadolu Toptan Hırdavat', tip: 'tedarikci', yetkili: 'Hasan Öz', telefon: '0212 555 66 77', il: 'İstanbul', vade_gun: 45 });
const t2 = cari({ kod: 'C00006', unvan: 'Marmara Kablo San.', tip: 'tedarikci', telefon: '0224 666 77 88', il: 'Bursa' });
dekontKaydet({ cari_id: m4, yon: 'borc', tutar: 450000, tarih: g(-90), tur: 'acilis' });

const urun = (v) => ins('urunler', { birim: 'Adet', kdv: 20, ...v });
const u = [
  urun({ kod: 'VD-001', ad: 'Vida 4x40 (100\'lü)', grup: 'Bağlantı', birim: 'Paket', alis_fiyat: 4500, satis_fiyat: 7500, kritik_stok: 20 }),
  urun({ kod: 'KB-025', ad: 'NYA Kablo 2,5 mm', grup: 'Elektrik', birim: 'Mt', alis_fiyat: 1200, satis_fiyat: 1900, kritik_stok: 200 }),
  urun({ kod: 'MT-010', ad: 'Darbeli Matkap 750W', grup: 'El Aletleri', alis_fiyat: 180000, satis_fiyat: 265000, kritik_stok: 3 }),
  urun({ kod: 'BY-015', ad: 'İç Cephe Boya 15 Lt', grup: 'Boya', alis_fiyat: 95000, satis_fiyat: 139000, kritik_stok: 10 }),
  urun({ kod: 'SL-001', ad: 'Silikon Şeffaf', grup: 'Yapı Kimyasalı', alis_fiyat: 6500, satis_fiyat: 11000, kritik_stok: 30 }),
];
const hizmet = { aciklama: 'Nakliye hizmeti', miktar: 1, birim: 'Adet', birim_fiyat: 150000, kdv: 20 };

faturaKaydet({ tur: 'alis', cari_id: t1, tarih: g(-80), kalemler: [
  { urun_id: u[0], aciklama: 'Vida 4x40 (100\'lü)', miktar: 200, birim: 'Paket', birim_fiyat: 4500, kdv: 20 },
  { urun_id: u[2], aciklama: 'Darbeli Matkap 750W', miktar: 12, birim_fiyat: 180000, kdv: 20 },
  { urun_id: u[3], aciklama: 'İç Cephe Boya 15 Lt', miktar: 40, birim_fiyat: 95000, kdv: 20 },
  { urun_id: u[4], aciklama: 'Silikon Şeffaf', miktar: 150, birim_fiyat: 6500, kdv: 20 },
] });
faturaKaydet({ tur: 'alis', cari_id: t2, tarih: g(-75), kalemler: [
  { urun_id: u[1], aciklama: 'NYA Kablo 2,5 mm', miktar: 2000, birim: 'Mt', birim_fiyat: 1200, kdv: 20 },
] });

const satis = [
  [m1, -70, [[0, 60], [3, 10], [4, 40]]],
  [m2, -60, [[2, 4], [3, 15]], true],
  [m3, -45, [[1, 800], [0, 30]]],
  [m1, -30, [[2, 3], [4, 50], [0, 50]]],
  [m4, -20, [[3, 2], [4, 5]]],
  [m2, -10, [[1, 900], [2, 2]], true],
  [m3, -3, [[1, 400], [4, 20]]],
];
const urunler = db().prepare('SELECT * FROM urunler').all();
for (const [c, gun, kalem, nakliye] of satis) {
  const kalemler = kalem.map(([i, m]) => ({ urun_id: urunler[i].id, aciklama: urunler[i].ad, miktar: m, birim: urunler[i].birim, birim_fiyat: urunler[i].satis_fiyat, kdv: 20 }));
  if (nakliye) kalemler.push(hizmet);
  faturaKaydet({ tur: 'satis', cari_id: c, tarih: g(gun), kalemler });
}

odemeKaydet({ yon: 'tahsilat', cari_id: m1, tarih: g(-50), satirlar: [
  { sekil: 'nakit', tutar: 300000, hesap_id: kasa },
  { sekil: 'cek', tutar: 1500000, cek: { no: '0045123', banka: 'İş Bankası', sube: 'Kızılay', vade: g(12), kesideci: 'Yılmaz Yapı Market' } },
] });
odemeKaydet({ yon: 'tahsilat', cari_id: m2, tarih: g(-40), satirlar: [
  { sekil: 'havale', tutar: 1200000, hesap_id: ziraat, aciklama: 'EFT' },
  { sekil: 'cek', tutar: 900000, cek: { no: '7781200', banka: 'Akbank', vade: g(25), kesideci: 'Demir İnşaat A.Ş.' } },
] });
odemeKaydet({ yon: 'tahsilat', cari_id: m3, tarih: g(-20), satirlar: [
  { sekil: 'kredi_karti', tutar: 800000, hesap_id: pos },
  { sekil: 'senet', tutar: 500000, cek: { vade: g(-2), kesideci: 'Ali Kaya' } },
] });
odemeKaydet({ yon: 'tahsilat', cari_id: m4, tarih: g(-5), satirlar: [{ sekil: 'nakit', tutar: 250000, hesap_id: kasa }] });
odemeKaydet({ yon: 'tahsilat', cari_id: m1, tarih: t, satirlar: [{ sekil: 'kredi_karti', tutar: 400000, hesap_id: pos, aciklama: '3 taksit' }] });

const cekler = db().prepare("SELECT id, no FROM cek_senet WHERE tur = 'cek'").all();
odemeKaydet({ yon: 'odeme', cari_id: t1, tarih: g(-35), satirlar: [
  { sekil: 'havale', tutar: 2000000, hesap_id: ziraat },
  { sekil: 'cek', tutar: 900000, cek_id: cekler.find((c) => c.no === '7781200').id },
  { sekil: 'cek', tutar: 1100000, cek: { no: 'G000301', vade: g(5), hesap_id: garanti } },
] });
odemeKaydet({ yon: 'odeme', cari_id: t2, tarih: g(-15), satirlar: [
  { sekil: 'havale', tutar: 1500000, hesap_id: garanti },
  { sekil: 'kredi_karti', tutar: 380000, hesap_id: kart },
] });
cekIslemi(cekler.find((c) => c.no === '0045123').id, { islem: 'tahsile_ver', hesap_id: ziraat, tarih: g(-2) });

for (const [kat, tutar, gun, h] of [['Kira', 2500000, -60, ziraat], ['Kira', 2500000, -30, ziraat], ['Elektrik', 185000, -25, kasa],
  ['Personel Maaş', 3200000, -28, ziraat], ['Yakıt', 240000, -12, kasa], ['İnternet/Telefon', 65000, -8, garanti], ['Kargo', 48000, -4, kasa]]) {
  hesapIslemi({ tur: 'gider', hesap_id: h, tutar, kategori: kat, tarih: g(gun) });
}
hesapIslemi({ tur: 'virman', hesap_id: kasa, hedef_hesap_id: ziraat, tutar: 500000, tarih: g(-6), aciklama: 'Kasadan bankaya para yatırıldı' });

console.log('Örnek veriler oluşturuldu.');
