const express = require('express');
const { db } = require('../db');
const { hata, dosyaAdi } = require('../util');
const { faturaKaydet, faturaGetir, faturaIptal, sonrakiNo, TURLER } = require('../services/fatura');
const { faturaPdf } = require('../services/pdf');

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
    .map((f) => ({ ...f, tur_ad: f.belge_tipi === 'fis' ? 'Satış Fişi' : TURLER[f.tur].ad }));
  res.json(rows);
});

r.get('/yeni-no', (req, res) => res.json({ no: sonrakiNo(req.query.tur || 'satis', req.query.belge_tipi) }));

r.get('/:id', (req, res) => res.json(faturaGetir(req.params.id)));

r.get('/:id/pdf', async (req, res) => {
  const f = faturaGetir(req.params.id);
  const buf = await faturaPdf(f);
  const dosya = dosyaAdi(`${f.tur_ad}_${f.no}`, 'pdf');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${dosya}"; filename*=UTF-8''${encodeURIComponent(dosya)}`);
  res.send(buf);
});

r.post('/', (req, res) => res.status(201).json({ id: faturaKaydet(req.body || {}) }));

r.put('/:id', (req, res) => res.json({ id: faturaKaydet(req.body || {}, Number(req.params.id)) }));

r.delete('/:id', (req, res) => {
  faturaIptal(Number(req.params.id));
  res.json({ ok: true });
});

module.exports = r;
