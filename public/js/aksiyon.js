// Uygulamanın her yerinden açılabilen işlem pencereleri.
// HTML'de <button data-aksiyon="tahsilat" data-cari="5"> gibi kullanılır.
import { odemeAc } from './pages/odeme.js';
import { hesapIslemFormu } from './pages/kasa.js';
import { cariFormu } from './pages/cariler.js';
import { urunFormu } from './pages/stok.js';
import { satisAc } from './pages/satis.js';
import { faturaAc } from './pages/fatura.js';

export const YENI = [
  ['satis', 'cash', 'Satış'],
  ['tahsilat', 'in', 'Tahsilat'],
  ['odeme', 'out', 'Ödeme'],
  ['fatura-satis', 'invoice', 'Satış faturası'],
  ['fatura-alis', 'invoice', 'Alış faturası'],
  ['gider', 'minus', 'Masraf'],
  ['cari-musteri', 'user', 'Müşteri'],
  ['cari-tedarikci', 'user', 'Tedarikçi'],
  ['urun', 'box', 'Ürün'],
];

/** veri: { cari, sekil, hesap } — yenile: kayıttan sonra sayfayı tazeler */
export function aksiyon(ad, veri = {}, yenile = () => {}) {
  switch (ad) {
    case 'satis':
      return satisAc({ cariId: veri.cari, onKaydet: yenile });
    case 'tahsilat':
    case 'odeme':
      return odemeAc({ yon: ad, cariId: veri.cari, sekil: veri.sekil, onKaydet: yenile });
    case 'gider':
    case 'gelir':
    case 'virman':
      return hesapIslemFormu(ad, veri.hesap, yenile);
    case 'fatura-satis':
    case 'fatura-alis':
      return faturaAc({ tur: ad.slice(7), cariId: veri.cari, onKaydet: yenile });
    case 'cari-musteri':
    case 'cari-tedarikci':
      return cariFormu(null, { tip: ad.slice(5) });
    case 'urun':
      return urunFormu(null, { onKaydet: (u) => { location.hash = `#/urun/${u.id}`; } });
    default:
      return null;
  }
}
