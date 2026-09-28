const express = require('express');
const { db } = require('../db');
const { hata, zorunlu, sec, tutar, tarih, bugun, secenek } = require('../util');
const { tx, yeniIslem } = require('../services/islem');

const r = express.Router();
const ALANLAR = ['kod', 'barkod', 'ad', 'grup', 'birim', 'kdv', 'alis_fiyat', 'satis_fiyat', 'kritik_stok', 'aktif', 'notlar'];

function dogrula(v) {
  if (v.ad !== undefined) v.ad = zorunlu(v.ad, 'Ürün adı');
  if (v.kdv !== undefined) v.kdv = Math.min(100, Math.max(0, Number(v.kdv) || 0));
  if (v.alis_fiyat !== undefined) v.alis_fiyat = tutar(v.alis_fiyat || 0, 'Alış fiyatı', { sifirOlabilir: true });
  if (v.satis_fiyat !== undefined) v.satis_fiyat = tutar(v.satis_fiyat || 0, 'Satış fiyatı', { sifirOlabilir: true });
  if (v.kritik_stok !== undefined) v.kritik_stok = Math.max(0, Number(v.kritik_stok) || 0);
  if (v.aktif !== undefined) v.aktif = v.aktif ? 1 : 0;
  return v;
}

function kodKontrol(kod, id) {
  if (kod && db().prepare('SELECT 1 FROM urunler WHERE kod = ? AND id != ?').get(kod, id || 0)) {
    throw hata(400, `"${kod}" kodu başka bir üründe kullanılıyor`);
  }
}

r.get('/', (req, res) => {
  const { q, durum } = req.query;
  const kosul = [req.query.pasif ? '1=1' : 'u.aktif = 1'];
  const par = {};
  if (q) {
    kosul.push('(u.ad LIKE @q OR u.kod LIKE @q OR u.barkod = @tam OR u.grup LIKE @q)');
    Object.assign(par, { q: `%${q}%`, tam: q });
  }
  let rows = db().prepare(`SELECT u.*, COALESCE(SUM(s.giris - s.cikis), 0) miktar
    FROM urunler u LEFT JOIN stok_hareketleri s ON s.urun_id = u.id
    WHERE ${kosul.join(' AND ')} GROUP BY u.id ORDER BY u.ad COLLATE NOCASE`).all(par);
  if (durum === 'kritik') rows = rows.filter((x) => x.miktar <= x.kritik_stok);
  res.json(rows);
});

r.get('/:id', (req, res) => {
  const u = db().prepare(`SELECT u.*, COALESCE((SELECT SUM(giris - cikis) FROM stok_hareketleri WHERE urun_id = u.id), 0) miktar
    FROM urunler u WHERE u.id = ?`).get(req.params.id);
  if (!u) throw hata(404, 'Ürün bulunamadı');
  u.hareketler = db().prepare(`SELECT s.*, f.no fatura_no FROM stok_hareketleri s LEFT JOIN faturalar f ON f.id = s.fatura_id
    WHERE s.urun_id = ? ORDER BY s.tarih DESC, s.id DESC LIMIT 200`).all(u.id);
  res.json(u);
});

r.post('/', (req, res) => {
  const v = dogrula(sec(req.body || {}, ALANLAR));
  if (!v.ad) throw hata(400, 'Ürün adı gerekli');
  kodKontrol(v.kod);
  const cols = Object.keys(v);
  const id = tx(() => {
    const id = db().prepare(`INSERT INTO urunler (${cols.join(',')}) VALUES (${cols.map((k) => '@' + k).join(',')})`).run(v).lastInsertRowid;
    const acilis = Number(req.body.acilis_miktar);
    if (acilis > 0) {
      const islem_id = yeniIslem('stok', bugun(), 'Açılış stoğu');
      db().prepare(`INSERT INTO stok_hareketleri (islem_id, urun_id, tarih, tur, giris, birim_fiyat, aciklama)
        VALUES (?, ?, ?, 'acilis', ?, ?, 'Açılış stoğu')`).run(islem_id, id, bugun(), acilis, v.alis_fiyat || 0);
    }
    return id;
  });
  res.status(201).json({ id });
});

r.put('/:id', (req, res) => {
  const v = dogrula(sec(req.body || {}, ALANLAR));
  kodKontrol(v.kod, req.params.id);
  const cols = Object.keys(v);
  if (cols.length) db().prepare(`UPDATE urunler SET ${cols.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...v, id: req.params.id });
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  const kullanim = db().prepare(`SELECT (SELECT COUNT(*) FROM stok_hareketleri WHERE urun_id = @id) +
    (SELECT COUNT(*) FROM fatura_kalemleri WHERE urun_id = @id) n`).get({ id: req.params.id }).n;
  if (kullanim) {
    db().prepare('UPDATE urunler SET aktif = 0 WHERE id = ?').run(req.params.id);
    return res.json({ ok: true, pasif: true });
  }
  db().prepare('DELETE FROM urunler WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Elle stok girişi / çıkışı / sayım düzeltmesi
r.post('/:id/hareket', (req, res) => {
  const u = db().prepare(`SELECT u.*, COALESCE((SELECT SUM(giris - cikis) FROM stok_hareketleri WHERE urun_id = u.id), 0) miktar
    FROM urunler u WHERE u.id = ?`).get(req.params.id);
  if (!u) throw hata(404, 'Ürün bulunamadı');
  const tur = secenek(req.body.tur, ['giris', 'cikis', 'sayim'], 'Hareket türü');
  const m = Number(req.body.miktar);
  if (!Number.isFinite(m) || m < 0 || (tur !== 'sayim' && m === 0)) throw hata(400, 'Miktar geçersiz');
  const t = tarih(req.body.tarih || bugun());
  let giris = 0;
  let cikis = 0;
  if (tur === 'giris') giris = m;
  else if (tur === 'cikis') cikis = m;
  else if (m > u.miktar) giris = m - u.miktar;
  else cikis = u.miktar - m;
  if (!giris && !cikis) return res.json({ ok: true });
  const aciklama = req.body.aciklama || { giris: 'Stok girişi', cikis: 'Stok çıkışı', sayim: `Sayım düzeltmesi (sayılan: ${m})` }[tur];
  const islem_id = tx(() => {
    const islem_id = yeniIslem('stok', t, aciklama);
    db().prepare(`INSERT INTO stok_hareketleri (islem_id, urun_id, tarih, tur, giris, cikis, birim_fiyat, aciklama)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(islem_id, u.id, t, tur, giris, cikis, u.alis_fiyat, aciklama);
    return islem_id;
  });
  res.status(201).json({ islem_id });
});

module.exports = r;
