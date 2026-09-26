const express = require('express');
const { db } = require('../db');
const { hata, zorunlu, secenek, sec } = require('../util');
const { hesapIslemi } = require('../services/islem');

const r = express.Router();
const ALANLAR = ['tip', 'ad', 'banka_adi', 'sube', 'hesap_no', 'iban', 'doviz', 'komisyon', 'valor_gun', 'bagli_banka_id', 'aktif', 'notlar'];

function dogrula(v) {
  if (v.ad !== undefined) v.ad = zorunlu(v.ad, 'Hesap adı');
  if (v.tip !== undefined) secenek(v.tip, ['kasa', 'banka', 'pos', 'kart'], 'Hesap türü');
  if (v.doviz !== undefined) secenek(v.doviz, ['TRY', 'USD', 'EUR', 'GBP'], 'Döviz');
  if (v.komisyon !== undefined) v.komisyon = Math.min(100, Math.max(0, Number(v.komisyon) || 0));
  if (v.valor_gun !== undefined) v.valor_gun = Math.max(0, parseInt(v.valor_gun, 10) || 0);
  if (v.aktif !== undefined) v.aktif = v.aktif ? 1 : 0;
  return v;
}

r.get('/', (req, res) => {
  const rows = db().prepare(`SELECT h.*, COALESCE(SUM(x.giris - x.cikis), 0) bakiye,
      COALESCE(SUM(CASE WHEN x.valor > date('now', 'localtime') THEN x.giris - x.cikis ELSE 0 END), 0) bloke
    FROM hesaplar h LEFT JOIN hesap_hareketleri x ON x.hesap_id = h.id
    ${req.query.hepsi ? '' : 'WHERE h.aktif = 1'}
    GROUP BY h.id ORDER BY CASE h.tip WHEN 'kasa' THEN 1 WHEN 'banka' THEN 2 WHEN 'pos' THEN 3 ELSE 4 END, h.ad`).all();
  res.json(rows);
});

r.get('/kategoriler', (req, res) => {
  const varsayilan = ['Kira', 'Elektrik', 'Su', 'Doğalgaz', 'İnternet/Telefon', 'Personel Maaş', 'SGK', 'Vergi',
    'Yakıt', 'Kargo', 'Yemek', 'Kırtasiye', 'Bakım/Onarım', 'Banka Masrafı', 'POS Komisyonu', 'Faiz Geliri', 'Diğer'];
  const kullanilan = db().prepare('SELECT DISTINCT kategori FROM hesap_hareketleri WHERE kategori IS NOT NULL').all().map((x) => x.kategori);
  res.json([...new Set([...varsayilan, ...kullanilan])]);
});

r.get('/:id', (req, res) => {
  const h = db().prepare(`SELECT h.*, COALESCE((SELECT SUM(giris - cikis) FROM hesap_hareketleri WHERE hesap_id = h.id), 0) bakiye
    FROM hesaplar h WHERE h.id = ?`).get(req.params.id);
  if (!h) throw hata(404, 'Hesap bulunamadı');
  res.json(h);
});

r.post('/', (req, res) => {
  const v = dogrula(sec(req.body || {}, ALANLAR));
  if (!v.ad || !v.tip) throw hata(400, 'Hesap adı ve türü gerekli');
  const cols = Object.keys(v);
  const id = db().prepare(`INSERT INTO hesaplar (${cols.join(',')}) VALUES (${cols.map((k) => '@' + k).join(',')})`).run(v).lastInsertRowid;
  const acilis = req.body.acilis;
  if (acilis && Number(acilis) > 0) hesapIslemi({ tur: 'acilis', hesap_id: id, tutar: acilis });
  res.status(201).json({ id });
});

r.put('/:id', (req, res) => {
  const v = dogrula(sec(req.body || {}, ALANLAR));
  delete v.tip;
  const cols = Object.keys(v);
  if (cols.length) db().prepare(`UPDATE hesaplar SET ${cols.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...v, id: req.params.id });
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  const n = db().prepare('SELECT COUNT(*) n FROM hesap_hareketleri WHERE hesap_id = ?').get(req.params.id).n;
  if (n) {
    db().prepare('UPDATE hesaplar SET aktif = 0 WHERE id = ?').run(req.params.id);
    return res.json({ ok: true, pasif: true });
  }
  db().prepare('DELETE FROM hesaplar WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Gelir, gider, virman
r.post('/islem', (req, res) => {
  res.status(201).json({ islem_id: hesapIslemi(req.body || {}) });
});

module.exports = r;
