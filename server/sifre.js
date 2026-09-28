// Sunucuda giriş şifresini belirler veya sıfırlar: npm run sifre -- YeniSifre
const bcrypt = require('bcryptjs');
const { db, open } = require('./db');

const sifre = process.argv[2];
if (!sifre || sifre.length < 6) {
  console.log('Kullanım: npm run sifre -- YeniSifre   (en az 6 karakter)');
  process.exit(1);
}
open();
db().prepare("INSERT OR REPLACE INTO ayarlar (anahtar, deger) VALUES ('sifre_hash', ?)").run(bcrypt.hashSync(sifre, 10));
db().prepare('DELETE FROM oturumlar').run();
console.log('Şifre kaydedildi. Açık oturumlar kapatıldı.');
