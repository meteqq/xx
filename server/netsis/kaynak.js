// Netsis SQL Server veritabanından okuma
const sql = require('mssql');
const { KAYNAKLAR } = require('./esleme');

async function baglan({ sunucu = 'localhost', port = 1433, kullanici = 'sa', sifre, veritabani }) {
  return new sql.ConnectionPool({
    server: sunucu,
    port: Number(port),
    user: kullanici,
    password: sifre,
    database: veritabani || 'master',
    options: { encrypt: false, trustServerCertificate: true, useUTC: true },
    requestTimeout: 30 * 60 * 1000,
    connectionTimeout: 30000,
  }).connect();
}

/** Sunucudaki Netsis şirket veritabanlarını (TBLCASABIT içerenler) listeler. */
async function netsisVeritabanlari(pool) {
  const dbs = (await pool.request().query("SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0 ORDER BY name")).recordset;
  const sonuc = [];
  for (const { name } of dbs) {
    const r = await pool.request().query(`SELECT COUNT(*) n FROM [${name.replace(/]/g, ']]')}].INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TBLCASABIT'`);
    if (r.recordset[0].n) sonuc.push(name);
  }
  return sonuc;
}

/** Tablo → kolonlar haritası */
async function yapi(pool) {
  const rows = (await pool.request().query('SELECT TABLE_NAME t, COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS')).recordset;
  const m = new Map();
  for (const { t, c } of rows) {
    const k = t.toUpperCase();
    if (!m.has(k)) m.set(k, { ad: t, kolonlar: new Map() });
    m.get(k).kolonlar.set(c.toUpperCase(), c);
  }
  return m;
}

/** Eşleştirmeyi gerçek yapıya uygular: hangi tablo, hangi kolonlar kullanılacak, neler eksik. */
function coz(y, anahtar) {
  const tanim = KAYNAKLAR[anahtar];
  const tabloAdi = tanim.tablo.find((t) => y.has(t.toUpperCase()));
  if (!tabloAdi) return { anahtar, bulundu: false, aranan: tanim.tablo };
  const t = y.get(tabloAdi.toUpperCase());
  const alanlar = {};
  for (const [hedef, adaylar] of Object.entries(tanim.alanlar)) {
    const k = adaylar.find((a) => t.kolonlar.has(a.toUpperCase()));
    alanlar[hedef] = k ? t.kolonlar.get(k.toUpperCase()) : null;
  }
  const eksik = (tanim.zorunlu || []).filter((z) => !alanlar[z]);
  return { anahtar, bulundu: true, tablo: t.ad, alanlar, eksik };
}

/** Çözümlenen tablodan satırları okur; kolonlar hedef adlarla gelir. */
async function oku(pool, c, where = '') {
  if (!c?.bulundu || c.eksik.length) return [];
  const secim = Object.entries(c.alanlar).filter(([, k]) => k).map(([h, k]) => `[${k}] AS [${h}]`).join(', ');
  return (await pool.request().query(`SELECT ${secim} FROM [${c.tablo}] ${where}`)).recordset;
}

async function sayi(pool, c) {
  if (!c?.bulundu) return 0;
  return (await pool.request().query(`SELECT COUNT(*) n FROM [${c.tablo}]`)).recordset[0].n;
}

module.exports = { baglan, netsisVeritabanlari, yapi, coz, oku, sayi };
