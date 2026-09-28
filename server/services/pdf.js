// Ekstre, rapor, fatura ve makbuz PDF çıktıları (pdfkit + IBM Plex Sans: Türkçe karakterler ve web ile aynı görünüm)
const path = require('path');
const PDFDocument = require('pdfkit');
const { db } = require('../db');

const FONT = path.join(__dirname, '..', 'fonts', 'IBMPlexSans-Regular.woff');
const FONT_B = path.join(__dirname, '..', 'fonts', 'IBMPlexSans-SemiBold.woff');
const RENK = { koyu: '#1f2b38', gri: '#667585', cizgi: '#d5dde6', zemin: '#f1f4f8', vurgu: '#1d6fd1' };

const nf = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const para = (k) => nf.format((Number(k) || 0) / 100);
const tarih = (t) => (t ? t.slice(0, 10).split('-').reverse().join('.') : '');
const miktar = (m) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(Number(m) || 0);

function ayarlar() {
  const rows = db().prepare("SELECT anahtar, deger FROM ayarlar WHERE anahtar LIKE 'firma_%' OR anahtar = 'fatura_notu'").all();
  return Object.fromEntries(rows.map((r) => [r.anahtar, r.deger]));
}

/** PDF'i Buffer olarak üretir. ciz(doc) içeriği yazar. */
function uret(ciz, { yatay = false } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: yatay ? 'landscape' : 'portrait', margin: 36, bufferPages: true });
    doc.registerFont('n', FONT);
    doc.registerFont('b', FONT_B);
    doc.font('n').fontSize(9).fillColor(RENK.koyu);
    const parcalar = [];
    doc.on('data', (d) => parcalar.push(d));
    doc.on('end', () => resolve(Buffer.concat(parcalar)));
    doc.on('error', reject);
    try {
      ciz(doc);
      // Sayfa numaraları
      const aralik = doc.bufferedPageRange();
      for (let i = 0; i < aralik.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0; // alt bilgi kenar boşluğuna yazılırken yeni sayfa açılmasın
        const alt = doc.page.height - 26;
        doc.font('n').fontSize(7).fillColor(RENK.gri)
          .text(`Sayfa ${i + 1} / ${aralik.count}`, 36, alt, { width: doc.page.width - 72, align: 'right', lineBreak: false });
      }
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function baslik(doc, a, baslikMetni, alt) {
  const w = doc.page.width - 72;
  const y = doc.y;
  doc.font('b').fontSize(15).fillColor(RENK.koyu).text(baslikMetni, 36, y, { width: w * 0.55 });
  if (alt) doc.font('n').fontSize(9).fillColor(RENK.gri).text(alt, { width: w * 0.55 });
  const solAlt = doc.y;
  const firma = [a.firma_adres, a.firma_telefon && `Tel: ${a.firma_telefon}`, a.firma_eposta,
    a.firma_vergi_no && `${a.firma_vergi_dairesi || ''} V.D. ${a.firma_vergi_no}`].filter(Boolean);
  doc.font('b').fontSize(10).fillColor(RENK.koyu).text(a.firma_unvan || '', 36 + w * 0.5, y, { width: w * 0.5, align: 'right' });
  doc.font('n').fontSize(8).fillColor(RENK.gri);
  for (const s of firma) doc.text(s, 36 + w * 0.5, doc.y, { width: w * 0.5, align: 'right' });
  const son = Math.max(solAlt, doc.y) + 8;
  doc.moveTo(36, son).lineTo(36 + w, son).lineWidth(1.5).strokeColor(RENK.koyu).stroke();
  doc.x = 36;
  doc.y = son + 10;
  doc.fillColor(RENK.koyu);
}

/** İki sütunlu bilgi kutuları: [[etiket, değer], ...] */
function bilgiKutulari(doc, sol, sag) {
  const w = (doc.page.width - 72 - 12) / 2;
  const y0 = doc.y;
  const kutu = (x, satirlar) => {
    let y = y0 + 8;
    for (const [e, v] of satirlar) {
      doc.font('n').fontSize(8).fillColor(RENK.gri).text(e, x + 10, y, { width: 80 });
      doc.font(e === satirlar[0][0] ? 'b' : 'n').fontSize(9).fillColor(RENK.koyu).text(v || '', x + 92, y, { width: w - 102 });
      y = Math.max(doc.y, y + 12) + 2;
    }
    return y + 6;
  };
  const h1 = kutu(36, sol);
  const h2 = sag ? kutu(36 + w + 12, sag) : y0;
  const alt = Math.max(h1, h2);
  doc.roundedRect(36, y0, w, alt - y0, 4).lineWidth(0.8).strokeColor(RENK.cizgi).stroke();
  if (sag) doc.roundedRect(36 + w + 12, y0, w, alt - y0, 4).stroke();
  doc.x = 36;
  doc.y = alt + 12;
}

/** Ortak rapor yapısından tablo çizer (sayfa taşarsa başlık tekrarlanır). */
function tablo(doc, r) {
  const genislik = doc.page.width - 72;
  const sag = (k) => ['money', 'bakiye', 'number'].includes(k.type);
  const hucre = (k, v) => {
    if (v === undefined || v === null || v === '') return '';
    if (k.type === 'money') return para(v);
    if (k.type === 'bakiye') return `${para(Math.abs(v))} ${v > 0 ? '(B)' : v < 0 ? '(A)' : ''}`;
    if (k.type === 'date') return tarih(v);
    if (k.type === 'number') return miktar(v);
    return String(v);
  };
  // Sütun genişlikleri içerikten ölçülür: kısa sütunlar tek satır, kalan genişlik açıklama türü sütunlara
  const ESNEK = ['aciklama', 'unvan', 'ad', 'kalem', 'cari_unvan', 'kesideci', 'odeme_sekli_ad'];
  const olc = (k) => {
    doc.font('b').fontSize(7.5);
    let w = doc.widthOfString(k.label.toLocaleUpperCase('tr-TR'));
    doc.font('n').fontSize(8.5);
    for (const s of r.satirlar) w = Math.max(w, doc.widthOfString(hucre(k, s[k.key])));
    if (r.toplam && r.toplam[k.key] !== undefined) { doc.font('b'); w = Math.max(w, doc.widthOfString(hucre(k, r.toplam[k.key]))); }
    return Math.ceil(w) + 10;
  };
  const dogal = r.kolonlar.map(olc);
  const esnek = r.kolonlar.map((k) => ESNEK.includes(k.key) || (!k.type && dogal[r.kolonlar.indexOf(k)] > 170));
  const sabitToplam = dogal.reduce((a, w, i) => a + (esnek[i] ? 0 : w), 0);
  const esnekSayi = esnek.filter(Boolean).length;
  let gen;
  if (esnekSayi) {
    const kalan = genislik - sabitToplam;
    const esnekDogal = dogal.reduce((a, w, i) => a + (esnek[i] ? w : 0), 0);
    if (kalan >= esnekSayi * 90) {
      // Esnek sütunlar doğal genişliklerine oranla kalan alanı paylaşır
      gen = dogal.map((w, i) => (esnek[i] ? (kalan * Math.max(w, 90)) / Math.max(esnekDogal, esnekSayi * 90) : w));
    } else {
      // Yer yoksa tüm sütunlar orantılı küçülür (kısa sütunlar da gerekirse satır kırar)
      gen = dogal.map((w) => (w * genislik) / dogal.reduce((a, x) => a + x, 0));
    }
  } else {
    const top = dogal.reduce((a, w) => a + w, 0);
    gen = dogal.map((w) => (w * genislik) / top);
  }
  const altSinir = () => doc.page.height - 50;

  const basliklar = () => {
    const y = doc.y;
    doc.rect(36, y, genislik, 18).fill(RENK.zemin);
    let x = 36;
    doc.font('b').fontSize(7.5).fillColor(RENK.gri);
    r.kolonlar.forEach((k, i) => {
      doc.text(k.label.toLocaleUpperCase('tr-TR'), x + 4, y + 5, { width: gen[i] - 8, align: sag(k) ? 'right' : 'left', lineBreak: false });
      x += gen[i];
    });
    doc.y = y + 18;
  };
  const satir = (s, kalin = false) => {
    doc.font(kalin ? 'b' : 'n').fontSize(8.5);
    const metinler = r.kolonlar.map((k) => hucre(k, s[k.key]));
    const h = Math.max(...metinler.map((t, i) => doc.heightOfString(t || ' ', { width: gen[i] - 8 }))) + 8;
    if (doc.y + h > altSinir()) { doc.addPage(); basliklar(); doc.font(kalin ? 'b' : 'n').fontSize(8.5); }
    const y = doc.y;
    let x = 36;
    metinler.forEach((t, i) => {
      const k = r.kolonlar[i];
      const neg = k.type === 'bakiye' && s[k.key] > 0;
      doc.fillColor(neg && !kalin ? '#b0382c' : RENK.koyu).text(t, x + 4, y + 4, { width: gen[i] - 8, align: sag(k) ? 'right' : 'left' });
      x += gen[i];
    });
    doc.y = y + h;
    doc.moveTo(36, doc.y).lineTo(36 + genislik, doc.y).lineWidth(0.5).strokeColor(RENK.cizgi).stroke();
  };

  basliklar();
  if (!r.satirlar.length) {
    doc.font('n').fontSize(9).fillColor(RENK.gri).text('Kayıt yok', 36, doc.y + 8);
    return;
  }
  for (const s of r.satirlar) satir(s);
  if (r.toplam) {
    const t = { ...r.toplam };
    if (t[r.kolonlar[0].key] === undefined) t[r.kolonlar[0].key] = 'TOPLAM';
    const y = doc.y;
    doc.rect(36, y, genislik, 0.1).fill(RENK.koyu);
    satir(t, true);
  }
}

// ---------- Belgeler ----------

function raporPdf(r) {
  const a = ayarlar();
  return uret((doc) => {
    baslik(doc, a, r.baslik, r.alt);
    tablo(doc, r);
    doc.moveDown(1).font('n').fontSize(7.5).fillColor(RENK.gri).text(`Oluşturma: ${new Date().toLocaleString('tr-TR')}`, 36);
  }, { yatay: r.kolonlar.length > 8 });
}

function ekstrePdf(r) {
  const a = ayarlar();
  const c = r.cari;
  const son = r.toplam.bakiye;
  const durum = son > 0 ? 'Borçlu' : son < 0 ? 'Alacaklı' : '';
  return uret((doc) => {
    baslik(doc, a, 'Cari Hesap Ekstresi', r.alt);
    bilgiKutulari(doc, [
      ['Sayın', c.unvan], ['Adres', [c.adres, c.ilce, c.il].filter(Boolean).join(' ')],
      ['Vergi', c.vergi_no ? `${c.vergi_dairesi || ''} / ${c.vergi_no}` : c.tc_no || ''], ['Telefon', c.telefon || ''],
    ].filter(([, v], i) => i === 0 || v), [
      ['Bakiye', `${para(Math.abs(son))} TL ${durum}`], ['Toplam borç', `${para(r.toplam.borc)} TL`],
      ['Toplam alacak', `${para(r.toplam.alacak)} TL`], ['Tarih', tarih(new Date().toISOString())],
    ]);
    tablo(doc, r);
  });
}

function faturaPdf(f) {
  const a = ayarlar();
  return uret((doc) => {
    baslik(doc, a, f.tur_ad.toLocaleUpperCase('tr-TR'), `No: ${f.no}`);
    bilgiKutulari(doc, [
      ['Sayın', f.unvan], ['Adres', [f.adres, f.ilce, f.il].filter(Boolean).join(' ')],
      ['Vergi', f.vergi_no ? `${f.vergi_dairesi || ''} / ${f.vergi_no}` : f.tc_no || ''], ['Telefon', f.telefon || ''],
    ].filter(([, v], i) => i === 0 || v), [['Tarih', tarih(f.tarih)], ['Vade', tarih(f.vade)], ['Belge no', f.no]]);
    tablo(doc, {
      kolonlar: [
        { key: 'aciklama', label: 'Açıklama' }, { key: 'miktar', label: 'Miktar', type: 'number' }, { key: 'birim', label: 'Birim' },
        { key: 'birim_fiyat', label: 'Birim fiyat', type: 'money' }, { key: 'iskonto', label: 'İsk. %' }, { key: 'kdv', label: 'KDV %' },
        { key: 'tutar', label: 'Tutar', type: 'money' },
      ],
      satirlar: f.kalemler.map((k) => ({ ...k, iskonto: k.iskonto || '' })),
    });
    toplamlar(doc, [['Ara toplam', para(f.ara_toplam)], ...(f.iskonto ? [['İskonto', `-${para(f.iskonto)}`]] : []),
      ['KDV', para(f.kdv_toplam)], ['Genel toplam', `${para(f.genel_toplam)} TL`]]);
    if (f.aciklama) doc.font('n').fontSize(8.5).fillColor(RENK.koyu).text(`Not: ${f.aciklama}`, 36);
    if (a.fatura_notu) doc.font('n').fontSize(8.5).fillColor(RENK.gri).text(a.fatura_notu, 36);
    if (a.firma_iban) doc.font('n').fontSize(8.5).fillColor(RENK.koyu).text(`IBAN: ${a.firma_iban}`, 36);
  });
}

function toplamlar(doc, satirlar) {
  const w = 220;
  const x = doc.page.width - 36 - w;
  let y = doc.y + 8;
  satirlar.forEach(([e, v], i) => {
    const son = i === satirlar.length - 1;
    if (son) { doc.moveTo(x, y).lineTo(x + w, y).lineWidth(1).strokeColor(RENK.koyu).stroke(); y += 4; }
    doc.font(son ? 'b' : 'n').fontSize(son ? 11 : 9).fillColor(RENK.koyu);
    doc.text(e, x, y, { width: w / 2 });
    doc.text(v, x + w / 2, y, { width: w / 2, align: 'right' });
    y += son ? 18 : 14;
  });
  doc.x = 36;
  doc.y = y + 8;
}

function makbuzPdf(i) {
  const a = ayarlar();
  const tahsilat = i.tur === 'tahsilat';
  const ana = i.cari[0];
  const satirlar = i.cari.filter((h) => h.cari_id === ana.cari_id);
  const toplam = satirlar.reduce((s, h) => s + h.borc + h.alacak, 0);
  return uret((doc) => {
    baslik(doc, a, tahsilat ? 'TAHSİLAT MAKBUZU' : 'ÖDEME MAKBUZU', `No: ${i.belge_no || i.id} · Tarih: ${tarih(i.tarih)}`);
    bilgiKutulari(doc, [[tahsilat ? 'Ödeyen' : 'Ödenen', ana.unvan], ['Açıklama', i.aciklama || '']].filter(([, v], n) => n === 0 || v));
    tablo(doc, {
      kolonlar: [{ key: 'odeme_sekli_ad', label: 'Ödeme şekli' }, { key: 'aciklama', label: 'Açıklama' },
        { key: 'vade', label: 'Vade', type: 'date' }, { key: 't', label: 'Tutar', type: 'money' }],
      satirlar: satirlar.map((h) => ({ ...h, t: h.borc + h.alacak })),
      toplam: { t: toplam },
    });
    if (i.bakiye !== null) {
      doc.moveDown(0.8).font('n').fontSize(9).fillColor(RENK.koyu)
        .text(`Güncel bakiye: ${para(Math.abs(i.bakiye))} TL ${i.bakiye > 0 ? 'Borçlu' : i.bakiye < 0 ? 'Alacaklı' : ''}`, 36);
    }
  });
}

module.exports = { raporPdf, ekstrePdf, faturaPdf, makbuzPdf };
