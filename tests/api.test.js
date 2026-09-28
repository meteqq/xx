const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cari-test-'));
process.env.DB_FILE = path.join(dir, 'test.db');
const { createApp } = require('../server/index');
const { close } = require('../server/db');

let server;
let base;
let cookie = '';

async function api(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.arrayBuffer();
  if (!res.ok) throw Object.assign(new Error(data.hata || res.status), { status: res.status });
  return data;
}
const get = (u) => api('GET', u);
const post = (u, b) => api('POST', u, b);

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

let musteri, tedarikci, kasa, banka, pos;
const bakiye = async (id) => (await get(`/api/cariler/${id}`)).bakiye;
const hesapBakiye = async (id) => (await get(`/api/hesaplar/${id}`)).bakiye;

test('kurulum ve giriş', async () => {
  assert.equal((await get('/api/auth/durum')).kurulu, false);
  await assert.rejects(get('/api/cariler'), { status: 401 });
  await post('/api/auth/kurulum', { sifre: 'gizli123', firma_unvan: 'Test Ltd' });
  assert.deepEqual(await get('/api/auth/durum'), { kurulu: true, girisli: true });
  cookie = '';
  await assert.rejects(post('/api/auth/giris', { sifre: 'yanlis' }), { status: 401 });
  await post('/api/auth/giris', { sifre: 'gizli123' });
  assert.ok(Array.isArray(await get('/api/cariler')));
});

test('cari ve hesap oluşturma', async () => {
  musteri = (await post('/api/cariler', { unvan: 'Ahmet Yılmaz', tip: 'musteri', vade_gun: 30,
    acilis: { yon: 'borc', tutar: 100000 } })).id;
  tedarikci = (await post('/api/cariler', { unvan: 'Toptan AŞ', tip: 'tedarikci' })).id;
  assert.equal(await bakiye(musteri), 100000);
  const hesaplar = await get('/api/hesaplar');
  kasa = hesaplar.find((h) => h.tip === 'kasa').id;
  banka = (await post('/api/hesaplar', { tip: 'banka', ad: 'Ziraat', iban: 'TR00', acilis: 500000 })).id;
  pos = (await post('/api/hesaplar', { tip: 'pos', ad: 'Ziraat POS', komisyon: 2, valor_gun: 30 })).id;
  assert.equal(await hesapBakiye(banka), 500000);
  const kod = (await get(`/api/cariler/${musteri}`)).kod;
  assert.match(kod, /^C\d{5}$/);
});

test('parçalı tahsilat: nakit + kredi kartı + çek', async () => {
  const { islem_id } = await post('/api/odeme', {
    yon: 'tahsilat', cari_id: musteri, tarih: '2026-01-10',
    satirlar: [
      { sekil: 'nakit', tutar: 20000, hesap_id: kasa },
      { sekil: 'kredi_karti', tutar: 30000, hesap_id: pos },
      { sekil: 'cek', tutar: 40000, cek: { no: 'A123', banka: 'Garanti', vade: '2026-03-01' } },
    ],
  });
  assert.equal(await bakiye(musteri), 10000);
  assert.equal(await hesapBakiye(kasa), 20000);
  assert.equal(await hesapBakiye(pos), 30000 - 600); // %2 komisyon
  const cekler = await get('/api/cekler?durum=portfoy');
  assert.equal(cekler.length, 1);
  assert.equal(cekler[0].tutar, 40000);
  const detay = await get(`/api/islemler/${islem_id}`);
  assert.equal(detay.cari.length, 3);
  assert.equal(detay.hesap.find((h) => h.tur === 'tahsilat' && h.hesap_id === pos).valor, '2026-02-09');
});

test('işlem iptali tüm kayıtları geri alır', async () => {
  const { islem_id } = await post('/api/odeme', { yon: 'tahsilat', cari_id: musteri,
    satirlar: [{ sekil: 'havale', tutar: 5000, hesap_id: banka }] });
  assert.equal(await bakiye(musteri), 5000);
  await api('DELETE', `/api/islemler/${islem_id}`);
  assert.equal(await bakiye(musteri), 10000);
  assert.equal(await hesapBakiye(banka), 500000);
});

test('yanlış hesap türü ve eksik bilgi reddedilir', async () => {
  await assert.rejects(post('/api/odeme', { yon: 'tahsilat', cari_id: musteri,
    satirlar: [{ sekil: 'nakit', tutar: 100, hesap_id: banka }] }), { status: 400 });
  await assert.rejects(post('/api/odeme', { yon: 'tahsilat', cari_id: musteri,
    satirlar: [{ sekil: 'cek', tutar: 100, cek: { vade: '2026-01-01' } }] }), /numarası/);
  await assert.rejects(post('/api/odeme', { yon: 'tahsilat', cari_id: musteri,
    satirlar: [{ sekil: 'nakit', tutar: -5, hesap_id: kasa }] }), { status: 400 });
});

test('çek ciro, karşılıksız ve geri alma', async () => {
  const cek = (await get('/api/cekler?durum=portfoy'))[0];
  // Tedarikçiye ödeme ekranından ciro
  const { islem_id } = await post('/api/odeme', { yon: 'odeme', cari_id: tedarikci,
    satirlar: [{ sekil: 'cek', tutar: cek.tutar, cek_id: cek.id }] });
  assert.equal(await bakiye(tedarikci), 40000);
  assert.equal((await get(`/api/cekler/${cek.id}`)).durum, 'ciro');
  // Karşılıksız: tedarikçi çeki iade eder, müşteri tekrar borçlanır
  const k = await post(`/api/cekler/${cek.id}/islem`, { islem: 'karsiliksiz' });
  assert.equal(await bakiye(tedarikci), 0);
  assert.equal(await bakiye(musteri), 50000);
  // Sıralı geri alma: önce son işlem
  await assert.rejects(api('DELETE', `/api/islemler/${islem_id}`), /sonra/);
  await api('DELETE', `/api/islemler/${k.islem_id}`);
  await api('DELETE', `/api/islemler/${islem_id}`);
  const c = await get(`/api/cekler/${cek.id}`);
  assert.equal(c.durum, 'portfoy');
  assert.equal(c.ciro_cari_id, null);
  assert.equal(await bakiye(musteri), 10000);
  assert.equal(await bakiye(tedarikci), 0);
});

test('çek tahsile ver ve tahsil et', async () => {
  const cek = (await get('/api/cekler?durum=portfoy'))[0];
  await post(`/api/cekler/${cek.id}/islem`, { islem: 'tahsile_ver', hesap_id: banka });
  await assert.rejects(post(`/api/cekler/${cek.id}/islem`, { islem: 'ciro', cari_id: tedarikci }), { status: 400 });
  await post(`/api/cekler/${cek.id}/islem`, { islem: 'tahsil' });
  assert.equal(await hesapBakiye(banka), 540000);
  assert.equal((await get(`/api/cekler/${cek.id}`)).hareketler.length, 3);
});

test('verilen çek ve ödenmesi', async () => {
  await post('/api/odeme', { yon: 'odeme', cari_id: tedarikci,
    satirlar: [{ sekil: 'cek', tutar: 25000, cek: { no: 'B1', vade: '2026-04-01', hesap_id: banka } }] });
  const cek = (await get('/api/cekler?yon=verilen'))[0];
  assert.equal(cek.durum, 'verildi');
  await post(`/api/cekler/${cek.id}/islem`, { islem: 'ode' });
  assert.equal(await hesapBakiye(banka), 515000);
});

test('satış faturası stok ve cariyi günceller, düzenleme ve iptal', async () => {
  const urun = (await post('/api/urunler', { ad: 'Vida', kod: 'V1', satis_fiyat: 1000, kdv: 20, acilis_miktar: 100 })).id;
  const { id } = await post('/api/faturalar', { tur: 'satis', cari_id: musteri, tarih: '2026-02-01',
    kalemler: [
      { urun_id: urun, aciklama: 'Vida', miktar: 10, birim_fiyat: 1000, kdv: 20, iskonto: 10 },
      { aciklama: 'Montaj hizmeti', miktar: 1, birim_fiyat: 5000, kdv: 20 },
    ] });
  const f = await get(`/api/faturalar/${id}`);
  assert.equal(f.ara_toplam, 15000);
  assert.equal(f.iskonto, 1000);
  assert.equal(f.kdv_toplam, 2800);
  assert.equal(f.genel_toplam, 16800);
  assert.equal(f.vade, '2026-03-03'); // cari vade günü 30
  assert.equal(await bakiye(musteri), 10000 + 16800);
  assert.equal((await get(`/api/urunler/${urun}`)).miktar, 90);

  await api('PUT', `/api/faturalar/${id}`, { ...f, kalemler: [{ urun_id: urun, aciklama: 'Vida', miktar: 5, birim_fiyat: 1000, kdv: 0 }] });
  assert.equal(await bakiye(musteri), 10000 + 5000);
  assert.equal((await get(`/api/urunler/${urun}`)).miktar, 95);
  assert.equal((await get(`/api/faturalar/${id}`)).no, f.no);

  await api('DELETE', `/api/faturalar/${id}`);
  assert.equal(await bakiye(musteri), 10000);
  assert.equal((await get(`/api/urunler/${urun}`)).miktar, 100);
});

test('raporlar ve Excel', async () => {
  const e = await get(`/api/rapor/ekstre?cari_id=${musteri}`);
  assert.equal(e.toplam.bakiye, 10000);
  assert.equal(e.satirlar.at(-1).bakiye, 10000);
  const y = await get('/api/rapor/yaslandirma');
  assert.equal(y.satirlar.find((r) => r.id === musteri).bakiye, 10000);
  for (const ad of ['bakiye', 'cek', 'stok', 'fatura', 'urun', 'gelirgider', 'kasa']) {
    const r = await get(`/api/rapor/${ad}`);
    assert.ok(Array.isArray(r.satirlar), ad);
  }
  await get(`/api/rapor/hesap?hesap_id=${banka}`);
  const x = await get(`/api/rapor/ekstre/excel?cari_id=${musteri}`);
  assert.equal(Buffer.from(x).subarray(0, 2).toString(), 'PK');
  const o = await get('/api/ozet');
  assert.ok(o.hesaplar.length >= 3);
  assert.ok((await get('/api/islemler')).length > 0);
});

test('gelir, gider ve virman', async () => {
  await post('/api/hesaplar/islem', { tur: 'gider', hesap_id: kasa, tutar: 1000, kategori: 'Kira' });
  await post('/api/hesaplar/islem', { tur: 'virman', hesap_id: banka, hedef_hesap_id: kasa, tutar: 10000 });
  assert.equal(await hesapBakiye(kasa), 20000 - 1000 + 10000);
  const g = await get('/api/rapor/gelirgider');
  assert.ok(g.satirlar.some((r) => r.kategori === 'Kira' && r.gider === 1000));
});

test('yedek indir ve geri yükle', async () => {
  const yedek = Buffer.from(await get('/api/yedek'));
  assert.equal(yedek.subarray(0, 15).toString(), 'SQLite format 3');
  const once = await bakiye(musteri);
  await post('/api/cariler/' + musteri + '/dekont', { yon: 'borc', tutar: 999 });
  assert.equal(await bakiye(musteri), once + 999);

  const fd = new FormData();
  fd.append('dosya', new Blob([yedek]), 'yedek.db');
  const res = await fetch(base + '/api/yedek', { method: 'POST', body: fd, headers: { cookie } });
  assert.equal(res.status, 200);
  assert.equal(await bakiye(musteri), once);

  const bozuk = new FormData();
  bozuk.append('dosya', new Blob([Buffer.from('bozuk dosya')]), 'x.db');
  const r2 = await fetch(base + '/api/yedek', { method: 'POST', body: bozuk, headers: { cookie } });
  assert.equal(r2.status, 400);
  assert.equal(await bakiye(musteri), once);
});

test('hızlı satış: nakit, kart, veresiye, parçalı ve iptal', async () => {
  const urun = (await post('/api/urunler', { ad: 'Kalem', kod: 'K1', satis_fiyat: 1000, kdv: 20, acilis_miktar: 50 })).id;
  const kalem = (m) => [{ urun_id: urun, aciklama: 'Kalem', miktar: m, birim_fiyat: 1200, kdv: 20 }];
  const kasaOnce = await hesapBakiye(kasa);

  // Nakit: KDV dahil 12,00 x 3 = 36,00 tam tutmalı; peşin müşteri otomatik oluşur
  const s1 = await post('/api/satis', { odeme: 'nakit', kalemler: kalem(3) });
  assert.equal(s1.toplam, 3600);
  assert.equal(await hesapBakiye(kasa), kasaOnce + 3600);
  const pesin = (await get('/api/cariler?q=Peşin'))[0];
  assert.equal(pesin.bakiye, 0);
  assert.equal((await get(`/api/urunler/${urun}`)).miktar, 47);
  const f = await get(`/api/faturalar/${s1.fatura_id}`);
  assert.equal(f.belge_tipi, 'fis');
  assert.equal(f.kdv_toplam, 600);

  // Kart: POS hesabına girer
  await post('/api/satis', { odeme: 'kredi_karti', kalemler: kalem(1) });

  // Veresiye müşterisiz olmaz; müşteriyle cari borçlanır
  await assert.rejects(post('/api/satis', { odeme: 'veresiye', kalemler: kalem(1) }), /müşteri/);
  const b0 = await bakiye(musteri);
  await post('/api/satis', { odeme: 'veresiye', cari_id: musteri, kalemler: kalem(2) });
  assert.equal(await bakiye(musteri), b0 + 2400);

  // Parçalı: 10 nakit + 5 kart, kalan 9 veresiye
  const s4 = await post('/api/satis', { odeme: 'parcali', cari_id: musteri, nakit: 1000, kart: 500, kalemler: kalem(2) });
  assert.equal(await bakiye(musteri), b0 + 2400 + 900);
  await assert.rejects(post('/api/satis', { odeme: 'parcali', nakit: 100, kalemler: kalem(1) }), /müşteri/);

  // Fişi iptal edince tahsilat da geri alınır
  const kasaSonra = await hesapBakiye(kasa);
  await api('DELETE', `/api/faturalar/${s4.fatura_id}`);
  assert.equal(await bakiye(musteri), b0 + 2400);
  assert.equal(await hesapBakiye(kasa), kasaSonra - 1000);

  const g = await get('/api/rapor/gunsonu');
  assert.ok(g.satirlar.some((r) => r.kalem.startsWith('Satış')));
});
