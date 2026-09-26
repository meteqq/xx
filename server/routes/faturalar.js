const express = require('express');
const { db } = require('../db');
const { hata } = require('../util');
const { faturaKaydet, faturaGetir, sonrakiNo, TURLER } = require('../services/fatura');
const { islemIptal } = require('../services/islem');

const r = express.Router();

r.get('/', (req, res) => {
  const { q, tur, bas, bit, cari_id, iptal } = req.query;
  const kosul = [iptal === '1' ? 'f.iptal = 1' : 'f.iptal = 0'];
  const par = {};
  if (tur) { kosul.push('f.tur = @tur'); par.tur = tur; }
  if (bas) { kosul.push('f.tarih >= @bas'); par.bas = bas; }
  if (bit) { kosul.push('f.tarih <= @bit'); par.bit = bit; }
  if (cari_id) { kosul.push('f.cari_id = @cari_id'); par.cari_id = cari_id; }
  if (q) { kosul.push('(f.no LIKE @q OR c.unvan LIKE @q OR f.aciklama LIKE @q)'); par.q = `%${q}%`; }
  const rows = db().prepare(`SELECT f.*, c.unvan FROM faturalar f JOIN cariler c ON c.id = f.cari_id
    WHERE ${kosul.join(' AND ')} ORDER BY f.tarih DESC, f.id DESC LIMIT 500`).all(par)
    .map((f) => ({ ...f, tur_ad: TURLER[f.tur].ad }));
  res.json(rows);
});

r.get('/yeni-no', (req, res) => res.json({ no: sonrakiNo(req.query.tur || 'satis') }));

r.get('/:id', (req, res) => res.json(faturaGetir(req.params.id)));

r.post('/', (req, res) => res.status(201).json({ id: faturaKaydet(req.body || {}) }));

r.put('/:id', (req, res) => res.json({ id: faturaKaydet(req.body || {}, Number(req.params.id)) }));

r.delete('/:id', (req, res) => {
  const f = db().prepare('SELECT * FROM faturalar WHERE id = ?').get(req.params.id);
  if (!f || f.iptal) throw hata(404, 'Fatura bulunamadı');
  if (f.islem_id) islemIptal(f.islem_id);
  else db().prepare('UPDATE faturalar SET iptal = 1 WHERE id = ?').run(f.id);
  res.json({ ok: true });
});

module.exports = r;
