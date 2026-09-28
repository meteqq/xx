// Otomatik günlük yedek: data/yedekler/cari-YYYY-MM-DD.db, son 30 gün saklanır.
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');
const { bugun } = require('./util');

const KLASOR = process.env.YEDEK_DIR || path.join(DATA_DIR, 'yedekler');
const SAKLA = Number(process.env.YEDEK_GUN) || 30;

/** Veritabanının tutarlı bir kopyasını yazar (çalışırken güvenli). */
function kopyala(dosya) {
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  fs.rmSync(dosya, { force: true });
  db().prepare('VACUUM INTO ?').run(dosya);
  return dosya;
}

const gunluk = () => fs.existsSync(KLASOR)
  ? fs.readdirSync(KLASOR).filter((f) => /^cari-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort()
  : [];

function gunlukYedek() {
  const dosya = path.join(KLASOR, `cari-${bugun()}.db`);
  if (fs.existsSync(dosya)) return null;
  kopyala(dosya);
  for (const eski of gunluk().slice(0, -SAKLA)) fs.rmSync(path.join(KLASOR, eski), { force: true });
  return dosya;
}

/** Açılışta ve saatte bir kontrol eder; o gün yedek yoksa alır. */
function otomatikYedekBaslat() {
  const calis = () => {
    try {
      const d = gunlukYedek();
      if (d) console.log(`Yedek alındı: ${d}`);
    } catch (err) {
      console.error('Otomatik yedek alınamadı:', err.message);
    }
  };
  calis();
  setInterval(calis, 60 * 60e3).unref();
}

function durum() {
  const liste = gunluk();
  const son = liste[liste.length - 1];
  return { klasor: KLASOR, adet: liste.length, son: son ? fs.statSync(path.join(KLASOR, son)).mtime.toISOString() : null };
}

module.exports = { kopyala, gunlukYedek, otomatikYedekBaslat, durum, KLASOR };
