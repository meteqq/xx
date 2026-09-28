const express = require('express');
const { db } = require('../db');
const { hata, zorunlu, secenek, sec, tutar } = require('../util');
const { dekontKaydet, tx } = require('../services/islem');
const { cariUrunHareket } = require('../services/rapor');

const r = express.Router();
const ALANLAR = ['kod', 'unvan', 'tip', 'yetkili', 'telefon', 'telefon2', 'eposta', 'adres', 'il', 'ilce',
  'vergi_dairesi', 'vergi_no', 'tc_no', 'iban', 'doviz', 'risk_limiti', 'vade_gun', 'iskonto', 'grup', 'notlar', 'aktif'];

function yeniKod() {
  const son = db().prepare("SELECT kod FROM cariler WHERE kod GLOB 'C[0-9]*' ORDER BY length(kod) DESC, kod DESC LIMIT 1").get();
  const n = son ? parseInt(son.kod.slice(1), 10) + 1 : 1;
  return 'C' + String(n).padStart(5, '0');
}

function dogrula(v) {
  if (v.unvan !== undefined) v.unvan = zorunlu(v.unvan, 'Ünvan');
  if (v.tip !== undefined) secenek(v.tip, ['musteri', 'tedarikci', 'her_ikisi'], 'Cari tipi');
  if (v.doviz !== undefined) secenek(v.doviz, ['TRY', 'USD', 'EUR', 'GBP'], 'Döviz');
  if (v.risk_limiti !== undefined) v.risk_limiti = tutar(v.risk_limiti || 0, 'Risk limiti', { sifirOlabilir: true });
  if (v.vade_gun !== undefined) v.vade_gun = Math.max(0, parseInt(v.vade_gun, 10) || 0);
  if (v.iskonto !== undefined) v.iskonto = Math.min(100, Math.max(0, Number(v.iskonto) || 0));
  if (v.aktif !== undefined) v.aktif = v.aktif ? 1 : 0;
  if (v.eposta && !/^\S+@\S+\.\S+$/.test(v.eposta)) throw hata(400, 'E-posta adresi geçersiz');
  return v;
}

function kodCakisma(kod, id) {
  if (kod && db().prepare('SELECT 1 FROM cariler WHERE kod = ? AND id != ?').get(kod, id || 0)) {
    throw hata(400, `"${kod}" kodu başka bir caride kullanılıyor`);
  }
}

r.get('/', (req, res) => {
  const { q, tip, durum, aktif } = req.query;
  const kosul = [];
  const par = {};
  if (aktif !== 'hepsi') kosul.push(aktif === '0' ? 'c.aktif = 0' : 'c.aktif = 1');
  if (tip === 'musteri') kosul.push("c.tip IN ('musteri','her_ikisi')");
  if (tip === 'tedarikci') kosul.push("c.tip IN ('tedarikci','her_ikisi')");
  if (q) {
    kosul.push('(c.unvan LIKE @q OR c.kod LIKE @q OR c.telefon LIKE @q OR c.yetkili LIKE @q OR c.vergi_no LIKE @q OR c.grup LIKE @q)');
    par.q = `%${q}%`;
  }
  let rows = db().prepare(`SELECT c.id, c.kod, c.unvan, c.tip, c.yetkili, c.telefon, c.il, c.ilce, c.grup, c.doviz, c.risk_limiti, c.aktif,
      COALESCE(SUM(h.borc - h.alacak), 0) bakiye, MAX(h.tarih) son_islem
    FROM cariler c LEFT JOIN cari_hareketler h ON h.cari_id = c.id
    ${kosul.length ? 'WHERE ' + kosul.join(' AND ') : ''}
    GROUP BY c.id ORDER BY c.unvan COLLATE NOCASE`).all(par);
  if (durum === 'borclu') rows = rows.filter((x) => x.bakiye > 0);
  if (durum === 'alacakli') rows = rows.filter((x) => x.bakiye < 0);
  if (durum === 'risk') rows = rows.filter((x) => x.risk_limiti > 0 && x.bakiye > x.risk_limiti);
  res.json(rows);
});

r.get('/yeni-kod', (req, res) => res.json({ kod: yeniKod() }));

r.get('/:id', (req, res) => {
  const c = db().prepare('SELECT * FROM cariler WHERE id = ?').get(req.params.id);
  if (!c) throw hata(404, 'Cari bulunamadı');
  const t = db().prepare(`SELECT COALESCE(SUM(borc), 0) borc, COALESCE(SUM(alacak), 0) alacak,
      COALESCE(SUM(borc - alacak), 0) bakiye
    FROM cari_hareketler WHERE cari_id = ?`).get(c.id);
  c.borc = t.borc;
  c.alacak = t.alacak;
  c.bakiye = t.bakiye;
  c.cekler = db().prepare(`SELECT COUNT(*) adet, COALESCE(SUM(tutar), 0) tutar FROM cek_senet
    WHERE cari_id = ? AND durum IN ('portfoy','tahsilde','verildi')`).get(c.id);
  c.son_tahsilat = db().prepare("SELECT tarih, alacak FROM cari_hareketler WHERE cari_id = ? AND tur = 'tahsilat' ORDER BY tarih DESC, id DESC LIMIT 1").get(c.id) || null;
  res.json(c);
});

r.post('/', (req, res) => {
  const v = dogrula(sec(req.body || {}, ALANLAR));
  if (!v.unvan) throw hata(400, 'Ünvan gerekli');
  v.kod = v.kod || yeniKod();
  kodCakisma(v.kod);
  const acilis = req.body.acilis;
  const id = tx(() => {
    const cols = Object.keys(v);
    const id = db().prepare(`INSERT INTO cariler (${cols.join(',')}) VALUES (${cols.map((k) => '@' + k).join(',')})`).run(v).lastInsertRowid;
    if (acilis && Number(acilis.tutar) > 0) {
      dekontKaydet({ cari_id: id, yon: acilis.yon, tutar: acilis.tutar, tarih: acilis.tarih, tur: 'acilis', aciklama: 'Açılış bakiyesi' });
    }
    return id;
  });
  res.status(201).json({ id });
});

r.put('/:id', (req, res) => {
  const v = dogrula(sec(req.body || {}, ALANLAR));
  if (!db().prepare('SELECT 1 FROM cariler WHERE id = ?').get(req.params.id)) throw hata(404, 'Cari bulunamadı');
  kodCakisma(v.kod, req.params.id);
  const cols = Object.keys(v);
  if (cols.length) db().prepare(`UPDATE cariler SET ${cols.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...v, id: req.params.id });
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  const id = req.params.id;
  const kullanim = db().prepare(`SELECT
      (SELECT COUNT(*) FROM cari_hareketler WHERE cari_id = @id) +
      (SELECT COUNT(*) FROM cek_senet WHERE cari_id = @id OR ciro_cari_id = @id) +
      (SELECT COUNT(*) FROM faturalar WHERE cari_id = @id) n`).get({ id }).n;
  if (kullanim) {
    db().prepare('UPDATE cariler SET aktif = 0 WHERE id = ?').run(id);
    return res.json({ ok: true, pasif: true });
  }
  db().prepare('DELETE FROM cariler WHERE id = ?').run(id);
  res.json({ ok: true });
});

r.get('/:id/urun-hareket', (req, res) => res.json(cariUrunHareket(Number(req.params.id), req.query)));

r.post('/:id/dekont', (req, res) => {
  const islem_id = dekontKaydet({ ...req.body, cari_id: req.params.id });
  res.status(201).json({ islem_id });
});

module.exports = r;
