export const HIZLI = [
  ['#/odeme?yon=tahsilat', 'in', 'Tahsilat', 'green'],
  ['#/odeme?yon=odeme', 'out', 'Ödeme', 'red'],
  ['#/fatura/yeni?tur=satis', 'invoice', 'Fatura', 'blue'],
  ['#/kasa?islem=gider', 'minus', 'Masraf', 'orange'],
];

const RENK = {
  green: 'var(--green-soft);color:var(--green)', red: 'var(--red-soft);color:var(--red)',
  blue: 'var(--primary-soft);color:var(--primary)', orange: 'var(--orange-soft);color:var(--orange)',
  purple: 'var(--purple-soft);color:var(--purple)',
};
export const renkStil = (r) => `background:${RENK[r]}`;

export const CARI_TIP = { musteri: 'Müşteri', tedarikci: 'Tedarikçi', her_ikisi: 'Müşteri + Tedarikçi' };
export const DOVIZ = [['TRY', 'TL (₺)'], ['USD', 'Dolar ($)'], ['EUR', 'Euro (€)'], ['GBP', 'Sterlin (£)']];

export const ODEME_SEKLI = {
  nakit: ['Nakit', 'cash'],
  kredi_karti: ['Kredi Kartı', 'card'],
  havale: ['Havale / EFT', 'transfer'],
  cek: ['Çek', 'cheque'],
  senet: ['Senet', 'note'],
  mahsup: ['Cari Mahsup', 'swap'],
  diger: ['Diğer', 'dots'],
};

export const HESAP_TIP = { kasa: ['Kasa', 'cash'], banka: ['Banka', 'bank'], pos: ['POS', 'card'], kart: ['Firma Kredi Kartı', 'card'] };

export const CEK_DURUM = {
  portfoy: ['Portföyde', 'blue'], tahsilde: ['Tahsilde', 'purple'], ciro: ['Ciro Edildi', ''],
  tahsil: ['Tahsil Edildi', 'green'], karsiliksiz: ['Karşılıksız', 'red'], iade: ['İade', ''],
  verildi: ['Ödenecek', 'orange'], odendi: ['Ödendi', 'green'],
};

export const FATURA_TUR = {
  satis: 'Satış Faturası', alis: 'Alış Faturası', satis_iade: 'Satış İade Faturası', alis_iade: 'Alış İade Faturası',
};

export const BIRIMLER = ['Adet', 'Kg', 'Gr', 'Lt', 'Mt', 'M²', 'M³', 'Paket', 'Koli', 'Kutu', 'Saat', 'Gün', 'Ay', 'Takım', 'Ton'];
export const KDV_ORANLARI = [0, 1, 10, 20];
