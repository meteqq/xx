const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { db, replaceWith } = require('../db');
const { hata, bugun, gunEkle, sec, dosyaAdi } = require('../util');
const { odemeKaydet, islemIptal, SEKIL_AD } = require('../services/islem');
const { satisKaydet } = require('../services/satis');
const { rapor, CARI_TUR_AD, HESAP_TIP_AD } = require('../services/rapor');
const { raporExcel } = require('../services/excel');
const { raporPdf, ekstrePdf, makbuzPdf } = require('../services/pdf');

function pdfGonder(res, buf, ad) {
  const dosya = dosyaAdi(ad, 'pdf');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${dosya}"; filename*=UTF-8''${encodeURIComponent(dosya)}`);
  res.send(buf);
}

const r = express.Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } });

const ISLEM_TUR_AD = {
  tahsilat: 'Tahsilat', odeme: 'Ödeme', fatura: 'Fatura', gelir: 'Gelir', gider: 'Gider', virman: 'Virman',
  acilis: 'Açılış', borc_dekont: 'Borç Dekontu', alacak_dekont: 'Alacak Dekontu', stok: 'Stok',
  cek_tahsile_ver: 'Çek Tahsile Verildi', cek_tahsil: 'Evrak Tahsil', cek_ciro: 'Evrak Ciro',
  cek_karsiliksiz: 'Karşılıksız Evrak', cek_iade: 'Evrak İade', cek_portfoye_al: 'Portföye Alındı',
  cek_ode: 'Evrak Ödendi', cek_geri_al: 'Evrak Geri Alındı', netsis: 'Netsis Aktarımı',
};

function firma() {
  return db().prepare("SELECT deger FROM ayarlar WHERE anahtar = 'firma_unvan'").get()?.deger || '';
}

// --- Tahsilat / Ödeme ---
r.post('/odeme', (req, res) => {
  res.status(201).json({ islem_id: odemeKaydet(req.body || {}) });
});

// --- Hızlı satış ---
r.post('/satis', (req, res) => {
  res.status(201).json(satisKaydet(req.body || {}));
});

// --- İşlem listesi, detayı ve iptali ---
r.get('/islemler', (req, res) => {
  const { bas, bit, tur, q } = req.query;
  const kosul = ['1=1'];
  const par = {};
  if (bas) { kosul.push('i.tarih >= @bas'); par.bas = bas; }
  if (bit) { kosul.push('i.tarih <= @bit'); par.bit = bit; }
  if (tur) { kosul.push(tur === 'cek' ? "i.tur LIKE 'cek_%'" : 'i.tur = @tur'); par.tur = tur; }
  if (q) { kosul.push('(i.aciklama LIKE @q OR i.belge_no LIKE @q OR c.unvan LIKE @q)'); par.q = `%${q}%`; }
  const rows = db().prepare(`SELECT i.*, c.id cari_id, c.unvan cari_unvan,
      COALESCE((SELECT SUM(borc + alacak) FROM cari_hareketler WHERE islem_id = i.id AND cari_id = c.id),
               (SELECT MAX(SUM(giris), SUM(cikis)) FROM hesap_hareketleri WHERE islem_id = i.id), 0) tutar,
      (SELECT group_concat(DISTINCT odeme_sekli) FROM cari_hareketler WHERE islem_id = i.id) sekiller
    FROM islemler i
    LEFT JOIN cariler c ON c.id = (SELECT cari_id FROM cari_hareketler WHERE islem_id = i.id ORDER BY id LIMIT 1)
    WHERE ${kosul.join(' AND ')} ORDER BY i.tarih DESC, i.id DESC LIMIT ${Math.min(Number(req.query.limit) || 300, 1000)}`).all(par);
  res.json(rows.map((x) => ({
    ...x,
    tur_ad: ISLEM_TUR_AD[x.tur] || x.tur,
    sekiller_ad: (x.sekiller || '').split(',').filter(Boolean).map((s) => SEKIL_AD[s]).join(', '),
  })));
});

function islemDetay(id) {
  const i = db().prepare('SELECT * FROM islemler WHERE id = ?').get(id);
  if (!i) throw hata(404, 'İşlem bulunamadı');
  i.tur_ad = ISLEM_TUR_AD[i.tur] || i.tur;
  i.cari = db().prepare(`SELECT h.*, c.unvan, c.kod FROM cari_hareketler h JOIN cariler c ON c.id = h.cari_id
    WHERE h.islem_id = ? ORDER BY h.id`).all(i.id)
    .map((h) => ({ ...h, tur_ad: CARI_TUR_AD[h.tur], odeme_sekli_ad: SEKIL_AD[h.odeme_sekli] || '' }));
  i.hesap = db().prepare(`SELECT h.*, x.ad hesap_ad, x.tip FROM hesap_hareketleri h JOIN hesaplar x ON x.id = h.hesap_id
    WHERE h.islem_id = ? ORDER BY h.id`).all(i.id).map((h) => ({ ...h, tip_ad: HESAP_TIP_AD[h.tip] }));
  i.cekler = db().prepare('SELECT * FROM cek_senet WHERE id IN (SELECT cek_id FROM cek_hareketleri WHERE islem_id = ?)').all(i.id);
  i.stok = db().prepare(`SELECT s.*, u.ad FROM stok_hareketleri s JOIN urunler u ON u.id = s.urun_id WHERE s.islem_id = ?`).all(i.id);
  i.fatura = db().prepare('SELECT id, no FROM faturalar WHERE islem_id = ?').get(i.id) || null;
  i.bakiye = i.cari[0]
    ? db().prepare('SELECT COALESCE(SUM(borc - alacak), 0) b FROM cari_hareketler WHERE cari_id = ?').get(i.cari[0].cari_id).b
    : null;
  return i;
}

r.get('/islemler/:id', (req, res) => res.json(islemDetay(req.params.id)));

r.get('/islemler/:id/pdf', async (req, res) => {
  const i = islemDetay(req.params.id);
  if (!['tahsilat', 'odeme'].includes(i.tur) || !i.cari.length) throw hata(400, 'Bu işlem için makbuz yok');
  pdfGonder(res, await makbuzPdf(i), `Makbuz_${i.cari[0].unvan}_${i.tarih}`);
});

r.delete('/islemler/:id', (req, res) => {
  islemIptal(req.params.id);
  res.json({ ok: true });
});

// --- Ana sayfa özeti ---
r.get('/ozet', (req, res) => {
  const d = db();
  const t = bugun();
  const ayBas = t.slice(0, 8) + '01';
  const cariBakiye = d.prepare(`SELECT c.doviz, SUM(CASE WHEN b > 0 THEN b ELSE 0 END) alacak, SUM(CASE WHEN b < 0 THEN -b ELSE 0 END) borc
    FROM (SELECT c.id, c.doviz, COALESCE(SUM(h.borc - h.alacak), 0) b FROM cariler c
          LEFT JOIN cari_hareketler h ON h.cari_id = c.id GROUP BY c.id) c GROUP BY c.doviz`).all();
  const hesaplar = d.prepare(`SELECT h.id, h.tip, h.ad, h.doviz, COALESCE(SUM(x.giris - x.cikis), 0) bakiye
    FROM hesaplar h LEFT JOIN hesap_hareketleri x ON x.hesap_id = h.id WHERE h.aktif = 1 GROUP BY h.id
    ORDER BY CASE h.tip WHEN 'kasa' THEN 1 WHEN 'banka' THEN 2 WHEN 'pos' THEN 3 ELSE 4 END, h.ad`).all();
  const cek = (yon, kosul, ...p) => d.prepare(`SELECT COUNT(*) adet, COALESCE(SUM(tutar), 0) tutar FROM cek_senet
    WHERE yon = ? AND durum IN ('portfoy','tahsilde','verildi') ${kosul}`).get(yon, ...p);
  const bugunHareket = d.prepare(`SELECT COALESCE(SUM(CASE WHEN tur = 'tahsilat' THEN alacak END), 0) tahsilat,
      COALESCE(SUM(CASE WHEN tur = 'odeme' THEN borc END), 0) odeme FROM cari_hareketler WHERE tarih = ?`).get(t);
  const ay = d.prepare(`SELECT COALESCE(SUM(CASE WHEN tur = 'satis' THEN genel_toplam WHEN tur = 'satis_iade' THEN -genel_toplam END), 0) satis,
      COALESCE(SUM(CASE WHEN tur = 'alis' THEN genel_toplam WHEN tur = 'alis_iade' THEN -genel_toplam END), 0) alis
    FROM faturalar WHERE iptal = 0 AND tarih >= ?`).get(ayBas);
  const ayTahsilat = d.prepare("SELECT COALESCE(SUM(alacak), 0) t FROM cari_hareketler WHERE tur = 'tahsilat' AND tarih >= ?").get(ayBas).t;
  const ayGider = d.prepare("SELECT COALESCE(SUM(cikis), 0) t FROM hesap_hareketleri WHERE tur IN ('gider','komisyon') AND tarih >= ?").get(ayBas).t;

  const aylar = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(1);
    dt.setMonth(dt.getMonth() - i);
    const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    aylar.push({
      ay: k,
      satis: d.prepare("SELECT COALESCE(SUM(CASE WHEN tur='satis' THEN genel_toplam ELSE -genel_toplam END), 0) t FROM faturalar WHERE iptal = 0 AND tur IN ('satis','satis_iade') AND substr(tarih, 1, 7) = ?").get(k).t,
      tahsilat: d.prepare("SELECT COALESCE(SUM(alacak), 0) t FROM cari_hareketler WHERE tur = 'tahsilat' AND substr(tarih, 1, 7) = ?").get(k).t,
    });
  }

  const yas = rapor('yaslandirma', {}).toplam;
  const bugunSatis = d.prepare(`SELECT COUNT(*) adet, COALESCE(SUM(CASE WHEN tur = 'satis' THEN genel_toplam ELSE -genel_toplam END), 0) toplam
    FROM faturalar WHERE iptal = 0 AND tur IN ('satis','satis_iade') AND tarih = ?`).get(t);
  res.json({
    firma: firma(),
    tarih: t,
    gecikenAlacak: yas.g30 + yas.g60 + yas.g90 + yas.g90p,
    bugunSatis,
    cariBakiye,
    hesaplar,
    bugun: bugunHareket,
    ay: { ...ay, tahsilat: ayTahsilat, gider: ayGider },
    aylar,
    cek: {
      alinan: cek('alinan', ''),
      verilen: cek('verilen', ''),
      alinanGecmis: cek('alinan', 'AND vade < ?', t),
      verilenGecmis: cek('verilen', 'AND vade < ?', t),
      alinan7: cek('alinan', 'AND vade BETWEEN ? AND ?', t, gunEkle(t, 7)),
      verilen7: cek('verilen', 'AND vade BETWEEN ? AND ?', t, gunEkle(t, 7)),
    },
    yaklasanCekler: d.prepare(`SELECT c.id, c.tur, c.yon, c.no, c.vade, c.tutar, c.durum, ca.unvan FROM cek_senet c
      LEFT JOIN cariler ca ON ca.id = c.cari_id WHERE c.durum IN ('portfoy','tahsilde','verildi') AND c.vade <= ?
      ORDER BY c.vade LIMIT 10`).all(gunEkle(t, 15)),
    enBorclu: d.prepare(`SELECT c.id, c.unvan, c.telefon, c.risk_limiti, SUM(h.borc - h.alacak) bakiye FROM cariler c
      JOIN cari_hareketler h ON h.cari_id = c.id GROUP BY c.id HAVING bakiye > 0 ORDER BY bakiye DESC LIMIT 6`).all(),
    riskAsan: d.prepare(`SELECT c.id, c.unvan, c.risk_limiti, SUM(h.borc - h.alacak) bakiye FROM cariler c
      JOIN cari_hareketler h ON h.cari_id = c.id WHERE c.risk_limiti > 0 GROUP BY c.id HAVING bakiye > c.risk_limiti`).all(),
    kritikStok: d.prepare(`SELECT u.id, u.ad, u.birim, u.kritik_stok, COALESCE(SUM(s.giris - s.cikis), 0) miktar
      FROM urunler u LEFT JOIN stok_hareketleri s ON s.urun_id = u.id WHERE u.aktif = 1 AND u.kritik_stok > 0
      GROUP BY u.id HAVING miktar <= u.kritik_stok ORDER BY miktar LIMIT 10`).all(),
  });
});

// --- Genel arama ---
r.get('/ara', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const l = `%${q}%`;
  const d = db();
  const sonuc = [
    ...d.prepare("SELECT 'cari' tip, id, unvan baslik, COALESCE(kod, '') || ' ' || COALESCE(telefon, '') alt FROM cariler WHERE unvan LIKE ? OR kod LIKE ? OR telefon LIKE ? OR vergi_no LIKE ? LIMIT 8").all(l, l, l, l),
    ...d.prepare("SELECT 'urun' tip, id, ad baslik, COALESCE(kod, '') || ' ' || COALESCE(barkod, '') alt FROM urunler WHERE ad LIKE ? OR kod LIKE ? OR barkod = ? LIMIT 5").all(l, l, q),
    ...d.prepare("SELECT 'fatura' tip, f.id, f.no baslik, c.unvan alt FROM faturalar f JOIN cariler c ON c.id = f.cari_id WHERE f.iptal = 0 AND f.no LIKE ? LIMIT 5").all(l),
    ...d.prepare("SELECT 'cek' tip, id, (CASE tur WHEN 'cek' THEN 'Çek ' ELSE 'Senet ' END) || COALESCE(no, '') baslik, COALESCE(kesideci, '') alt FROM cek_senet WHERE no LIKE ? OR kesideci LIKE ? LIMIT 5").all(l, l),
  ];
  res.json(sonuc);
});

// --- Raporlar ---
r.get('/rapor/:ad', (req, res) => res.json(rapor(req.params.ad, req.query)));

r.get('/rapor/:ad/pdf', async (req, res) => {
  const rp = rapor(req.params.ad, req.query);
  const buf = req.params.ad === 'ekstre' ? await ekstrePdf(rp) : await raporPdf(rp);
  pdfGonder(res, buf, req.params.ad === 'ekstre' ? `Ekstre_${rp.cari.unvan}_${bugun()}` : `${rp.baslik}_${bugun()}`);
});

r.get('/rapor/:ad/excel', async (req, res) => {
  const rp = rapor(req.params.ad, req.query);
  const buf = await raporExcel(rp, firma());
  const dosya = dosyaAdi(`${rp.cari ? 'Ekstre_' + rp.cari.unvan : rp.baslik}_${bugun()}`, 'xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${dosya}"; filename*=UTF-8''${encodeURIComponent(dosya)}`);
  res.send(Buffer.from(buf));
});

// --- Ayarlar ---
const AYAR_ALANLARI = ['firma_unvan', 'firma_adres', 'firma_telefon', 'firma_eposta', 'firma_vergi_dairesi',
  'firma_vergi_no', 'firma_iban', 'fatura_seri', 'fatura_notu'];

r.get('/ayarlar', (req, res) => {
  const rows = db().prepare(`SELECT anahtar, deger FROM ayarlar WHERE anahtar IN (${AYAR_ALANLARI.map(() => '?').join(',')})`).all(...AYAR_ALANLARI);
  res.json(Object.fromEntries(rows.map((x) => [x.anahtar, x.deger])));
});

r.put('/ayarlar', (req, res) => {
  const v = sec(req.body || {}, AYAR_ALANLARI);
  const st = db().prepare('INSERT OR REPLACE INTO ayarlar (anahtar, deger) VALUES (?, ?)');
  db().transaction(() => { for (const [k, val] of Object.entries(v)) st.run(k, val); })();
  res.json({ ok: true });
});

// --- Yedekleme ---
r.get('/yedek', async (req, res) => {
  const dosya = path.join(os.tmpdir(), `cari-yedek-${Date.now()}.db`);
  await db().backup(dosya);
  res.download(dosya, `cari-yedek-${bugun()}.db`, () => fs.rm(dosya, { force: true }, () => {}));
});

r.post('/yedek', upload.single('dosya'), (req, res) => {
  if (!req.file) throw hata(400, 'Yedek dosyası seçin');
  try {
    replaceWith(req.file.path);
  } catch (e) {
    throw e.status ? e : hata(400, 'Yedek dosyası okunamadı: ' + e.message);
  } finally {
    fs.rm(req.file.path, { force: true }, () => {});
  }
  res.json({ ok: true });
});

module.exports = r;

