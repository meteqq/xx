// Yerel ağda HTTPS için kendinden imzalı sertifika. Telefonlarda "ana ekrana ekle" (uygulama olarak açılma)
// ve paylaşım menüsü yalnızca HTTPS'te çalışır. Sertifika data/ klasöründe saklanır; IP değişirse yenilenir.
const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const { DATA_DIR } = require('./db');

function uret(adresler) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = Date.now().toString(16);
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 5 * 365 * 86400000);
  const ad = [{ name: 'commonName', value: 'Cari Takip' }, { name: 'organizationName', value: 'Cari Takip' }];
  cert.setSubject(ad);
  cert.setIssuer(ad);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, keyCertSign: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, ...['127.0.0.1', ...adresler].map((ip) => ({ type: 7, ip }))] },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { key: forge.pki.privateKeyToPem(keys.privateKey), cert: forge.pki.certificateToPem(cert), adresler };
}

function sertifika(adresler) {
  const dosya = path.join(DATA_DIR, 'https.json');
  let s = null;
  try { s = JSON.parse(fs.readFileSync(dosya, 'utf8')); } catch { /* ilk çalıştırma */ }
  if (!s || adresler.some((ip) => !s.adresler.includes(ip))) {
    s = uret(adresler);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(dosya, JSON.stringify(s), { mode: 0o600 });
  }
  return { key: s.key, cert: s.cert };
}

module.exports = { sertifika };
