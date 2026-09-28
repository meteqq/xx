// Netsis aktarımı uçtan uca testi. Bir SQL Server gerektirir; yoksa atlanır.
//   NETSIS_TEST_SUNUCU=localhost NETSIS_TEST_PORT=14330 NETSIS_TEST_SIFRE=... npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SUNUCU = process.env.NETSIS_TEST_SUNUCU;
const baglanti = { sunucu: SUNUCU, port: process.env.NETSIS_TEST_PORT || 1433, kullanici: 'sa', sifre: process.env.NETSIS_TEST_SIFRE };
const VT = `NETSIS_TEST_${Date.now()}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsis-test-'));
process.env.DB_FILE = path.join(dir, 'test.db');

const atla = !SUNUCU && 'NETSIS_TEST_SUNUCU tanımlı değil';
let sql;
let pool;
let db;
let aktar;

before(async () => {
  if (atla) return;
  sql = require('mssql');
  ({ db } = require('../server/db'));
  ({ aktar } = require('../server/netsis/aktar'));
  const K = require('../server/netsis/kaynak');
  const ana = await K.baglan(baglanti);
  await ana.request().query(`CREATE DATABASE [${VT}] COLLATE Turkish_CI_AS`);
  await ana.close();
  pool = await K.baglan({ ...baglanti, veritabani: VT });
  const betik = fs.readFileSync(path.join(__dirname, 'netsis', 'ornek-netsis.sql'), 'utf8');
  await pool.request().batch(betik);
});

after(async () => {
  if (atla) return;
  await pool?.close();
  const K = require('../server/netsis/kaynak');
  const ana = await K.baglan(baglanti);
  await ana.request().query(`ALTER DATABASE [${VT}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${VT}]`);
  await ana.close();
  require('../server/db').close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const sessiz = async (fn) => {
  const log = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = log; }
};

test('deneme modu hiçbir şey yazmaz ama doğru özet verir', { skip: atla }, async () => {
  const r = await sessiz(() => aktar({ ...baglanti, veritabani: VT, deneme: true }));
  assert.equal(r.s.cari, 3);
  assert.equal(r.netsisBakiye, r.bizimBakiye);
  assert.equal(db().prepare("SELECT COUNT(*) n FROM cariler WHERE kaynak = 'netsis'").get().n, 0);
});

test('aktarım: cariler, bakiyeler, stok, faturalar, çekler ve kasalar Netsis ile tutar', { skip: atla }, async () => {
  const r = await sessiz(() => aktar({ ...baglanti, veritabani: VT }));
  const d = db();
  const bakiye = (kod) => d.prepare(`SELECT COALESCE(SUM(h.borc - h.alacak), 0) b FROM cariler c
    LEFT JOIN cari_hareketler h ON h.cari_id = c.id WHERE c.kod = ?`).get(kod).b;

  // Netsis'teki her carinin bakiyesi birebir
  const netsis = (await pool.request().query('SELECT CARI_KOD k, SUM(BORC) - SUM(ALACAK) b FROM TBLCAHAR GROUP BY CARI_KOD')).recordset;
  for (const { k, b } of netsis) assert.equal(bakiye(k), Math.round(b * 100), k);
  assert.equal(r.netsisBakiye, r.bizimBakiye);

  // Türkçe karakterler, tip, TC no
  const sahin = d.prepare("SELECT * FROM cariler WHERE kod = '120.01.001'").get();
  assert.equal(sahin.unvan, 'Şahin Yapı Malzemeleri Ltd. Şti.');
  assert.equal(sahin.tip, 'musteri');
  assert.equal(sahin.vade_gun, 30);
  assert.equal(d.prepare("SELECT tip FROM cariler WHERE kod = '320.01.001'").get().tip, 'tedarikci');
  assert.equal(d.prepare("SELECT tc_no FROM cariler WHERE kod = '120.01.002'").get().tc_no, '12345678901');
  assert.ok(r.uyari.some((u) => u.includes('120.99.999')));

  // Stok miktarları, fiyat ve barkod
  const stok = (kod) => d.prepare(`SELECT COALESCE(SUM(s.giris - s.cikis), 0) m FROM urunler u
    LEFT JOIN stok_hareketleri s ON s.urun_id = u.id WHERE u.kod = ?`).get(kod).m;
  assert.equal(stok('MTK-750'), 12);
  assert.equal(stok('VD-440'), 174);
  assert.equal(stok('SLK-01'), 22);
  const mtk = d.prepare("SELECT * FROM urunler WHERE kod = 'MTK-750'").get();
  assert.equal(mtk.satis_fiyat, 265000);
  assert.equal(mtk.barkod, '8691234567890');
  assert.equal(mtk.birim, 'Adet');
  assert.equal(d.prepare("SELECT birim FROM urunler WHERE kod = 'VD-440'").get().birim, 'Paket');

  // Faturalar arşiv olarak: irsaliye hariç, kalemleriyle; ekstre satırı faturaya bağlı
  const fat = d.prepare("SELECT * FROM faturalar WHERE kaynak = 'netsis' ORDER BY no").all();
  assert.deepEqual(fat.map((f) => f.no), ['AF000001', 'SF000001', 'SF000002']);
  assert.equal(fat.find((f) => f.no === 'SF000001').genel_toplam, 1188000);
  assert.equal(d.prepare('SELECT COUNT(*) n FROM fatura_kalemleri WHERE fatura_id = ?').get(fat.find((f) => f.no === 'SF000001').id).n, 2);
  assert.ok(d.prepare("SELECT fatura_id FROM cari_hareketler WHERE belge_no = 'SF000001'").get().fatura_id);

  // Çek / senet durumları
  const cek = (no) => d.prepare('SELECT * FROM cek_senet WHERE no = ?').get(no);
  assert.equal(cek('MC000001').durum, 'ciro');
  assert.ok(cek('MC000001').ciro_cari_id);
  assert.equal(cek('MC000002').durum, 'portfoy');
  assert.equal(cek('MC000003').durum, 'portfoy'); // tanınmayan kod → bekliyor + uyarı
  assert.ok(r.uyari.some((u) => u.includes('"X"')));
  assert.equal(cek('BC000001').yon, 'verilen');
  assert.equal(cek('BC000001').durum, 'verildi');

  // Kasalar
  const kasa = (ad) => d.prepare(`SELECT COALESCE(SUM(x.giris - x.cikis), 0) b FROM hesaplar h
    LEFT JOIN hesap_hareketleri x ON x.hesap_id = h.id WHERE h.ad = ?`).get(ad).b;
  assert.equal(kasa('Merkez Kasa'), 724975);
  assert.equal(kasa('Şube Kasası'), 120000);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM hesaplar WHERE ad = 'Merkez Kasa'").get().n, 1);
});

test('dolu veritabanına --temizle olmadan aktarılmaz; temizle ile tekrar aktarılır', { skip: atla }, async () => {
  await assert.rejects(sessiz(() => aktar({ ...baglanti, veritabani: VT })), /temizle/);
  await sessiz(() => aktar({ ...baglanti, veritabani: VT, temizle: true }));
  assert.equal(db().prepare("SELECT COUNT(*) n FROM cariler WHERE kaynak = 'netsis'").get().n, 4);
});
