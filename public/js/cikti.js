// Belge çıktıları: Yazdır · PDF · Gönder (WhatsApp / e-posta / paylaş) · Excel
import { $, icon, toast, menu, indir } from './ui.js';

async function pdfDosyasi(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).hata || 'Belge oluşturulamadı');
  const cd = res.headers.get('content-disposition') || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  const ad = m ? decodeURIComponent(m[1]) : 'belge.pdf';
  return new File([await res.blob()], ad, { type: 'application/pdf' });
}

function dosyaIndir(file) {
  const u = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = u;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}

const waNumara = (tel) => {
  const t = String(tel || '').replace(/\D/g, '');
  if (!t) return '';
  return t.startsWith('90') ? t : t.startsWith('0') ? '9' + t : '90' + t;
};

/**
 * PDF'i paylaşır. Telefonda sistem paylaşım menüsü açılır (WhatsApp, e-posta, ...).
 * Paylaşım desteklenmezse PDF indirilir ve WhatsApp / e-posta açılır.
 */
export async function gonder({ pdf, metin = '', telefon, eposta, baslik = 'Belge' }, anchor) {
  let file;
  try {
    file = await pdfDosyasi(pdf);
  } catch (err) {
    toast(err.message, 'err');
    return;
  }
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: baslik, text: metin });
    } catch { /* kullanıcı vazgeçti */ }
    return;
  }
  menu('Gönder', [
    ['WhatsApp', 'whatsapp', () => {
      dosyaIndir(file);
      const no = waNumara(telefon);
      window.open(`https://wa.me/${no}?text=${encodeURIComponent(metin)}`, '_blank', 'noopener');
      toast('PDF indirildi, WhatsApp\'ta sohbete ekleyin', 'ok');
    }],
    ['E-posta', 'mail', () => {
      dosyaIndir(file);
      location.href = `mailto:${eposta || ''}?subject=${encodeURIComponent(baslik)}&body=${encodeURIComponent(metin)}`;
      toast('PDF indirildi, e-postaya ekleyin', 'ok');
    }],
    ['PDF indir', 'download', () => dosyaIndir(file)],
  ], anchor);
}

/**
 * Düğme grubunu kapsayıcıya yerleştirir.
 * o: { pdf, yazdir?, excel?, metin?, telefon?, eposta?, baslik?, kucuk? }
 */
export function ciktiDugmeleri(kap, o) {
  const sm = o.kucuk ? 'sm' : '';
  kap.innerHTML = `<div class="cikti">
    <button class="btn ${sm}" data-c="yazdir">${icon('print')} Yazdır</button>
    <button class="btn ${sm}" data-c="pdf">${icon('pdf')} PDF</button>
    ${o.excel ? `<button class="btn ${sm}" data-c="excel">${icon('excel')} Excel</button>` : ''}
    <button class="btn primary ${sm}" data-c="gonder">${icon('share')} Gönder</button>
  </div>`;
  $('[data-c=yazdir]', kap).addEventListener('click', () => (o.yazdir ? o.yazdir() : window.open(o.pdf, '_blank')));
  $('[data-c=pdf]', kap).addEventListener('click', async () => {
    try { dosyaIndir(await pdfDosyasi(o.pdf)); } catch (err) { toast(err.message, 'err'); }
  });
  $('[data-c=excel]', kap)?.addEventListener('click', () => indir(o.excel));
  $('[data-c=gonder]', kap).addEventListener('click', (ev) => gonder(o, ev.currentTarget));
}
