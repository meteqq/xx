const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'cari.db');
const SCHEMA = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

let conn = null;

function open() {
  if (DB_FILE !== ':memory:') fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  conn = new Database(DB_FILE);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.exec(SCHEMA);
  migrate(conn);
  seedDefaults(conn);
  return conn;
}

/** Eski veritabanlarına sonradan eklenen kolonları ekler. */
function migrate(d) {
  const kolonEkle = (tablo, kolon, tanim) => {
    const var_ = d.prepare(`PRAGMA table_info(${tablo})`).all().some((k) => k.name === kolon);
    if (!var_) d.exec(`ALTER TABLE ${tablo} ADD COLUMN ${kolon} ${tanim}`);
  };
  kolonEkle('faturalar', 'belge_tipi', "TEXT NOT NULL DEFAULT 'fatura'");
  kolonEkle('faturalar', 'tahsilat_islem_id', 'INTEGER');
  for (const t of ['faturalar', 'cari_hareketler', 'stok_hareketleri', 'hesap_hareketleri', 'cek_senet', 'cariler', 'urunler', 'hesaplar']) {
    kolonEkle(t, 'kaynak', 'TEXT');
  }
}

function seedDefaults(d) {
  const hesapSayisi = d.prepare('SELECT COUNT(*) n FROM hesaplar').get().n;
  if (hesapSayisi === 0) d.prepare("INSERT INTO hesaplar (tip, ad) VALUES ('kasa', 'Merkez Kasa')").run();
  const set = d.prepare('INSERT OR IGNORE INTO ayarlar (anahtar, deger) VALUES (?, ?)');
  set.run('firma_unvan', 'Firmam');
  set.run('fatura_seri', 'FTR');
}

function db() {
  return conn || open();
}

function close() {
  if (conn) conn.close();
  conn = null;
}

/** Yedek dosyasıyla veritabanını değiştirir. */
function replaceWith(file) {
  const test = new Database(file, { readonly: true });
  try {
    const tablo = test.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cari_hareketler'").get();
    if (!tablo) throw Object.assign(new Error('Geçerli bir yedek dosyası değil'), { status: 400 });
  } finally {
    test.close();
  }
  close();
  for (const ek of ['-wal', '-shm']) fs.rmSync(DB_FILE + ek, { force: true });
  fs.copyFileSync(file, DB_FILE);
  open();
}

module.exports = { db, open, close, replaceWith, DB_FILE, DATA_DIR };
