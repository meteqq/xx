// Netsis tablo/kolon eşleştirmesi.
// Netsis sürümleri arasında kolon adları değişebildiği için her alan için olası adlar sırayla denenir;
// ilk bulunan kullanılır. Gerçek veritabanında farklı bir ad varsa sadece bu dosyaya eklemek yeterlidir.

const KAYNAKLAR = {
  cari: {
    tablo: ['TBLCASABIT'],
    zorunlu: ['kod', 'unvan'],
    alanlar: {
      kod: ['CARI_KOD'],
      unvan: ['CARI_ISIM', 'CARI_ADI'],
      tip: ['CARI_TIP'],
      telefon: ['CARI_TEL', 'TEL', 'TELEFON'],
      il: ['CARI_IL', 'IL'],
      ilce: ['CARI_ILCE', 'ILCE'],
      adres: ['CARI_ADRES', 'ADRES'],
      vergi_dairesi: ['VERGI_DAIRESI'],
      vergi_no: ['VERGI_NUMARASI', 'VERGI_NO'],
      eposta: ['EMAIL', 'E_MAIL', 'EPOSTA'],
      vade_gun: ['VADE_GUNU'],
      grup: ['GRUP_KODU'],
      iskonto: ['ISKONTO_ORANI'],
    },
  },
  cariEk: {
    tablo: ['TBLCASABITEK'],
    zorunlu: ['kod'],
    alanlar: { kod: ['CARI_KOD'], tc_no: ['TCKIMLIKNO', 'TC_KIMLIK_NO', 'TCKIMLIK'] },
  },
  cariHareket: {
    tablo: ['TBLCAHAR'],
    zorunlu: ['kod', 'tarih', 'borc', 'alacak'],
    alanlar: {
      kod: ['CARI_KOD'],
      tarih: ['TARIH'],
      vade: ['VADE_TARIHI', 'VADE'],
      belge_no: ['BELGE_NO'],
      aciklama: ['ACIKLAMA'],
      borc: ['BORC'],
      alacak: ['ALACAK'],
      hareket_turu: ['HAREKET_TURU'],
      sira: ['INC_KEY_NUMBER', 'ID'],
    },
  },
  stok: {
    tablo: ['TBLSTSABIT'],
    zorunlu: ['kod', 'ad'],
    alanlar: {
      kod: ['STOK_KODU'],
      ad: ['STOK_ADI'],
      birim: ['OLCU_BR1'],
      kdv: ['KDV_ORANI'],
      satis_fiyat: ['SATIS_FIAT1'],
      alis_fiyat: ['ALIS_FIAT1'],
      barkod: ['BARKOD1', 'BARKOD'],
      grup: ['GRUP_KODU'],
    },
  },
  stokEk: {
    tablo: ['TBLSTSABITEK'],
    zorunlu: ['kod'],
    alanlar: { kod: ['STOK_KODU'], barkod: ['BARKOD1', 'BARKOD'] },
  },
  stokHareket: {
    tablo: ['TBLSTHAR'],
    zorunlu: ['kod', 'tarih', 'miktar', 'gckod'],
    alanlar: {
      kod: ['STOK_KODU'],
      tarih: ['STHAR_TARIH'],
      miktar: ['STHAR_GCMIK'],
      gckod: ['STHAR_GCKOD'],
      fiyat: ['STHAR_NF', 'STHAR_BF'],
      kdv: ['STHAR_KDV'],
      fisno: ['FISNO'],
      ftirsip: ['STHAR_FTIRSIP'],
      cari: ['STHAR_CARIKOD', 'STHAR_ACIKLAMA'],
      iskonto: ['STHAR_SATISK'],
      sira: ['INCKEYNO', 'INC_KEY_NUMBER'],
    },
  },
  fatura: {
    tablo: ['TBLFATUIRS'],
    zorunlu: ['no', 'tip', 'cari', 'tarih'],
    alanlar: {
      no: ['FATIRS_NO'],
      tip: ['FTIRSIP'],
      cari: ['CARI_KODU', 'CARI_KOD'],
      tarih: ['TARIH'],
      vade: ['ODEMETARIHI', 'VADETARIHI'],
      brut: ['BRUTTUTAR'],
      kdv: ['KDV'],
      genel: ['GENELTOPLAM'],
      aciklama: ['ACIKLAMA'],
    },
  },
  kasa: {
    tablo: ['TBLKASA'],
    zorunlu: ['kod', 'tarih', 'tutar', 'io'],
    alanlar: {
      kod: ['KSMAS_KOD', 'KASA_KODU'],
      tarih: ['TARIH'],
      tutar: ['TUTAR'],
      io: ['IO'],
      aciklama: ['ACIKLAMA'],
      cari: ['CARI_MUH', 'KOD'],
    },
  },
  kasaTanim: {
    tablo: ['TBLKASMAS'],
    zorunlu: ['kod'],
    alanlar: { kod: ['KSMAS_KOD'], ad: ['KSMAS_NAME', 'KSMAS_ADI', 'ACIKLAMA'] },
  },
  bankaTanim: {
    tablo: ['TBLBNKHESSABIT'],
    zorunlu: ['kod'],
    alanlar: { kod: ['NETHESKODU', 'HESAPKODU'], ad: ['ACIKLAMA', 'HESAPADI'], banka: ['BANKAKODU', 'BANKA_KODU'], iban: ['IBAN'] },
  },
  bankaHareket: {
    tablo: ['TBLBNKHESTRA'],
    zorunlu: ['kod', 'tarih', 'tutar', 'ba'],
    alanlar: { kod: ['NETHESKODU', 'HESAPKODU'], tarih: ['TARIH'], tutar: ['TUTAR'], ba: ['BA'], aciklama: ['ACIKLAMA'] },
  },
};

// Çek / senet tabloları: müşteri (alınan) ve borç (verilen) evrakları
const EVRAK_TABLOLARI = [
  { anahtar: 'musteriCek', tablo: ['TBLMCEK'], tur: 'cek', yon: 'alinan' },
  { anahtar: 'musteriSenet', tablo: ['TBLMSEN'], tur: 'senet', yon: 'alinan' },
  { anahtar: 'borcCek', tablo: ['TBLBCEK'], tur: 'cek', yon: 'verilen' },
  { anahtar: 'borcSenet', tablo: ['TBLBSEN'], tur: 'senet', yon: 'verilen' },
];
const EVRAK_ALANLARI = {
  zorunlu: ['tutar', 'vade'],
  alanlar: {
    no: ['SC_NO', 'CEKNO', 'SENETNO'],
    seri: ['SC_SERI', 'CEKSERI'],
    cari: ['SC_VERENK', 'SC_VERILENK', 'CARI_KOD'],
    ciro_cari: ['SC_VERILENK', 'SC_CIROK'],
    tutar: ['SC_TUTAR', 'TUTAR'],
    vade: ['SC_VADE', 'VADETRH', 'VADE'],
    giris: ['SC_GIRTRH', 'GIRTRH', 'TARIH'],
    durum: ['SC_SONDUR', 'SONDURUM', 'DURUM'],
    banka: ['SC_BANKA', 'BANKA', 'BANKAKODU'],
    sube: ['SC_SUBE', 'SUBE'],
    kesideci: ['SC_BORCLU', 'KESIDECI', 'SC_KESIDECI'],
    aciklama: ['SC_ACIKLAMA', 'ACIKLAMA'],
  },
};
for (const t of EVRAK_TABLOLARI) KAYNAKLAR[t.anahtar] = { tablo: t.tablo, ...EVRAK_ALANLARI };
// Alınan evrakta cari = veren, verilen evrakta cari = verilen
KAYNAKLAR.borcCek.alanlar = { ...EVRAK_ALANLARI.alanlar, cari: ['SC_VERILENK', 'CARI_KOD'], ciro_cari: [] };
KAYNAKLAR.borcSenet.alanlar = { ...KAYNAKLAR.borcCek.alanlar };

/** Netsis son durum kodu → programdaki durum. Bilinmeyen kodlar raporlanır. */
const EVRAK_DURUM = {
  alinan: { P: 'portfoy', B: 'tahsilde', E: 'tahsilde', T: 'tahsil', C: 'ciro', K: 'karsiliksiz', I: 'iade', R: 'iade' },
  verilen: { P: 'verildi', V: 'verildi', O: 'odendi', T: 'odendi', I: 'iade', R: 'iade' },
};

/** Netsis fatura tipi (FTIRSIP) → fatura türü. İrsaliye ve siparişler fatura olarak aktarılmaz. */
const FATURA_TIPI = { 1: 'satis', 2: 'alis' };

/** CARI_TIP → cari tipi */
const CARI_TIPI = { A: 'musteri', S: 'tedarikci' };

/** Netsis ölçü birimi kısaltmaları → program birimleri (listede olmayan olduğu gibi kalır) */
const BIRIM = {
  AD: 'Adet', ADT: 'Adet', ADET: 'Adet', PK: 'Paket', PAK: 'Paket', PKT: 'Paket', KG: 'Kg', GR: 'Gr', LT: 'Lt', MT: 'Mt',
  M: 'Mt', M2: 'M²', M3: 'M³', KL: 'Koli', KOL: 'Koli', KT: 'Kutu', KUT: 'Kutu', TK: 'Takım', TON: 'Ton', SA: 'Saat', GUN: 'Gün',
};

module.exports = { KAYNAKLAR, EVRAK_TABLOLARI, EVRAK_DURUM, FATURA_TIPI, CARI_TIPI, BIRIM };
