const express = require('express');
const { db } = require('../db');
const { hata, sec, tarih } = require('../util');
const { cekIslemi } = require('../services/islem');
const { rapor, CEK_DURUM_AD } = require('../services/rapor');

const r = express.Router();

r.get('/', (req, res) => res.json(rapor('cek', req.query).satirlar));

r.get('/:id', (req, res) => {
  const c = db().prepare(`SELECT c.*, ca.unvan cari_unvan, cc.unvan ciro_unvan, h.ad hesap_ad
    FROM cek_senet c LEFT JOIN cariler ca ON ca.id = c.cari_id LEFT JOIN cariler cc ON cc.id = c.ciro_cari_id
    LEFT JOIN hesaplar h ON h.id = c.hesap_id WHERE c.id = ?`).get(req.params.id);
  if (!c) throw hata(404, 'Evrak bulunamadı');
  c.durum_ad = CEK_DURUM_AD[c.durum];
  c.hareketler = db().prepare('SELECT * FROM cek_hareketleri WHERE cek_id = ? ORDER BY id').all(c.id)
    .map((h) => ({ ...h, yeni_durum_ad: CEK_DURUM_AD[h.yeni_durum], eski_durum_ad: CEK_DURUM_AD[h.eski_durum] }));
  res.json(c);
});

// Evrak bilgilerini düzelt (tutar ve durum hariç)
r.put('/:id', (req, res) => {
  const v = sec(req.body || {}, ['no', 'banka', 'sube', 'hesap_no', 'kesideci', 'kefil', 'vade', 'aciklama']);
  if (v.vade !== undefined) tarih(v.vade, 'Vade');
  const cols = Object.keys(v);
  if (cols.length) db().prepare(`UPDATE cek_senet SET ${cols.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...v, id: req.params.id });
  if (v.vade) db().prepare('UPDATE cari_hareketler SET vade = ? WHERE cek_id = ?').run(v.vade, req.params.id);
  res.json({ ok: true });
});

r.post('/:id/islem', (req, res) => {
  res.status(201).json({ islem_id: cekIslemi(req.params.id, req.body || {}) });
});

module.exports = r;
