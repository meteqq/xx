const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const { db } = require('./db');
const { hata } = require('./util');

const COOKIE = 'cari_oturum';
const OTURUM_GUN = 30;
const denemeler = new Map(); // ip -> { sayi, ilk }

function sifreHash() {
  return db().prepare("SELECT deger FROM ayarlar WHERE anahtar='sifre_hash'").get()?.deger || null;
}

function oturumAc(res, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const bitis = new Date(Date.now() + OTURUM_GUN * 864e5).toISOString();
  db().prepare('INSERT INTO oturumlar (token, bitis) VALUES (?, ?)').run(token, bitis);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: OTURUM_GUN * 864e5,
  });
}

function oturumGecerli(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return false;
  const o = db().prepare('SELECT bitis FROM oturumlar WHERE token = ?').get(token);
  return !!o && o.bitis > new Date().toISOString();
}

function sifreKontrol(sifre) {
  if (typeof sifre !== 'string' || sifre.length < 6) throw hata(400, 'Şifre en az 6 karakter olmalı');
}

function limitKontrol(ip) {
  const simdi = Date.now();
  const d = denemeler.get(ip);
  if (d && simdi - d.ilk < 15 * 60e3 && d.sayi >= 10) {
    throw hata(429, 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.');
  }
}

function hataliDeneme(ip) {
  const simdi = Date.now();
  const d = denemeler.get(ip);
  if (!d || simdi - d.ilk >= 15 * 60e3) denemeler.set(ip, { sayi: 1, ilk: simdi });
  else d.sayi++;
}

const router = express.Router();

router.get('/durum', (req, res) => {
  res.json({ kurulu: !!sifreHash(), girisli: oturumGecerli(req) });
});

// İlk kurulum, sunucu konsoluna yazılan kodla yapılır: yayına alınan sunucuyu ilk açan yabancı şifre belirleyemez
let kurulumKodu = null;
function kurulumKoduHazirla() {
  if (sifreHash()) return null;
  kurulumKodu = process.env.KURULUM_KODU || String(crypto.randomInt(100000, 1000000));
  console.log(`\n  Kurulum kodu: ${kurulumKodu}\n  (İlk girişte şifre belirlerken bu kodu yazın)\n`);
  return kurulumKodu;
}

router.post('/kurulum', (req, res) => {
  if (sifreHash()) throw hata(400, 'Şifre zaten belirlenmiş');
  limitKontrol(req.ip);
  const { sifre, firma_unvan, kod } = req.body || {};
  if (!kurulumKodu) kurulumKoduHazirla();
  if (String(kod || '').trim() !== kurulumKodu) {
    hataliDeneme(req.ip);
    throw hata(400, 'Kurulum kodu hatalı. Kod, sunucu açılırken konsola yazılır.');
  }
  sifreKontrol(sifre);
  db().prepare("INSERT OR REPLACE INTO ayarlar (anahtar, deger) VALUES ('sifre_hash', ?)").run(bcrypt.hashSync(sifre, 10));
  if (firma_unvan) db().prepare("UPDATE ayarlar SET deger = ? WHERE anahtar = 'firma_unvan'").run(String(firma_unvan));
  kurulumKodu = null;
  oturumAc(res, req);
  res.json({ ok: true });
});

router.post('/giris', (req, res) => {
  limitKontrol(req.ip);
  const hash = sifreHash();
  if (!hash) throw hata(400, 'Önce şifre belirleyin');
  if (!bcrypt.compareSync(String(req.body?.sifre || ''), hash)) {
    hataliDeneme(req.ip);
    throw hata(401, 'Şifre hatalı');
  }
  denemeler.delete(req.ip);
  db().prepare('DELETE FROM oturumlar WHERE bitis < ?').run(new Date().toISOString());
  oturumAc(res, req);
  res.json({ ok: true });
});

router.post('/cikis', (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) db().prepare('DELETE FROM oturumlar WHERE token = ?').run(token);
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

router.post('/sifre', gerekli, (req, res) => {
  const { eski, yeni } = req.body || {};
  if (!bcrypt.compareSync(String(eski || ''), sifreHash())) throw hata(400, 'Mevcut şifre hatalı');
  sifreKontrol(yeni);
  db().prepare("UPDATE ayarlar SET deger = ? WHERE anahtar = 'sifre_hash'").run(bcrypt.hashSync(yeni, 10));
  db().prepare('DELETE FROM oturumlar').run();
  oturumAc(res, req);
  res.json({ ok: true });
});

function gerekli(req, res, next) {
  if (!oturumGecerli(req)) return res.status(401).json({ hata: 'Oturum açmanız gerekiyor' });
  next();
}

module.exports = { router, gerekli, kurulumKoduHazirla };
