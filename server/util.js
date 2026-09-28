function hata(status, mesaj) {
  return Object.assign(new Error(mesaj), { status });
}

function bugun() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function gunEkle(tarih, gun) {
  const d = new Date(tarih + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + Number(gun || 0));
  return d.toISOString().slice(0, 10);
}

/** API tutarları kuruş cinsinden tam sayı olarak alır. */
function tutar(v, alan = 'Tutar', { sifirOlabilir = false } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw hata(400, `${alan} geçersiz`);
  if (n < 0 || (!sifirOlabilir && n === 0)) throw hata(400, `${alan} sıfırdan büyük olmalı`);
  return n;
}

function tarih(v, alan = 'Tarih', { bos = false } = {}) {
  if (!v) {
    if (bos) return null;
    throw hata(400, `${alan} gerekli`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) throw hata(400, `${alan} geçersiz`);
  return v;
}

function zorunlu(v, alan) {
  if (v === undefined || v === null || String(v).trim() === '') throw hata(400, `${alan} gerekli`);
  return typeof v === 'string' ? v.trim() : v;
}

function secenek(v, liste, alan) {
  if (!liste.includes(v)) throw hata(400, `${alan} geçersiz`);
  return v;
}

/** Nesneden yalnızca izin verilen alanları alır; boş metinleri null yapar. */
function sec(obj, alanlar) {
  const out = {};
  for (const a of alanlar) {
    if (obj[a] === undefined) continue;
    out[a] = typeof obj[a] === 'string' && obj[a].trim() === '' ? null : obj[a];
  }
  return out;
}

/** Dosya adı: Türkçe harfler sadeleştirilir, güvenli karakterler bırakılır. */
function dosyaAdi(ad, uzanti) {
  const tr = { ı: 'i', İ: 'I', ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ü: 'u', Ü: 'U', ö: 'o', Ö: 'O', ç: 'c', Ç: 'C' };
  const temiz = String(ad).replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => tr[c]).normalize('NFKD').replace(/[^\w .-]/g, '')
    .trim().replace(/\s+/g, '_').slice(0, 120) || 'belge';
  return `${temiz}.${uzanti}`;
}

module.exports = { dosyaAdi, hata, bugun, gunEkle, tutar, tarih, zorunlu, secenek, sec };
