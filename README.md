# Cari Takip

Web tabanlı, telefondan ve bilgisayardan kullanılabilen cari hesap takip programı.

- **Cariler:** müşteri/tedarikçi kartları, risk limiti, vade günü, varsayılan iskonto, açılış bakiyesi, borç/alacak dekontu, ekstre (yazdır/PDF/Excel), WhatsApp ile bakiye bildirimi
- **Tahsilat / Ödeme:** nakit, kredi kartı (POS komisyonu ve valör dahil), havale/EFT, çek, senet, cari mahsup ve diğer (müşteri kartı, hediye çeki vb.). Bir işlemde birden fazla ödeme şekli (parçalı ödeme), makbuz yazdırma
- **Kasa & Banka:** kasa, banka, POS ve firma kredi kartı hesapları, gelir/masraf girişi (kategorili), hesaplar arası virman, hesap defteri
- **Çek / Senet:** portföy, vade takibi, bankaya tahsile verme, tahsil, tedarikçiye ciro, karşılıksız/protesto, iade; kendi çek/senetlerimizin ödenmesi; her evrakın hareket geçmişi
- **Stok & Fatura:** ürün kartları (barkod, KDV, alış/satış fiyatı, kritik stok), satış/alış/iade faturaları (satır iskontosu, KDV dahil/hariç fiyat), faturayla otomatik stok ve cari güncellemesi, sayım düzeltmesi
- **Raporlar:** cari ekstre, bakiye listesi, alacak yaşlandırma, kasa/banka defteri, çek/senet, satış/alış özeti, ürün satış, stok durum, gelir/gider — hepsi yazdırılabilir ve Excel'e aktarılabilir
- **Güvenlik ve yedek:** şifreli giriş, tek tıkla yedek indirme / geri yükleme
- Yanlış girilen her işlem, oluşturduğu tüm kayıtlarla birlikte **geri alınabilir**

## Kurulum

Gerekenler: [Node.js](https://nodejs.org) 20 veya üzeri.

```bash
npm install
npm start
```

Tarayıcıda `http://localhost:3000` adresini açın. İlk açılışta firma adınızı ve giriş şifrenizi belirlersiniz.

Denemek için örnek verilerle başlamak isterseniz (boş veritabanında):

```bash
npm run demo
```

## Telefondan kullanım

Program sunucuya kurulduğunda telefonun tarayıcısından aynı adresle açılır ve telefon ekranına göre düzenlenir.
Uygulama gibi kullanmak için:

- **iPhone (Safari):** Paylaş → *Ana Ekrana Ekle*
- **Android (Chrome):** ⋮ menü → *Ana ekrana ekle*

Aynı ağdaki telefondan denemek için bilgisayarın yerel IP adresini kullanın (ör. `http://192.168.1.20:3000`).

## Sunucuya kurulum (internetten erişim)

Bir VPS'e (Ubuntu vb.) kurmak için örnek:

```bash
git clone <depo-adresi> cari && cd cari
npm install --omit=dev
npm install -g pm2
PORT=3000 pm2 start server/index.js --name cari
pm2 save && pm2 startup
```

İnternete açarken mutlaka HTTPS kullanın. Nginx + Let's Encrypt ile örnek:

```nginx
server {
    server_name cari.alanadiniz.com;
    client_max_body_size 200m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Nginx arkasında çalışırken `TRUST_PROXY=1` ortam değişkenini verin (oturum çerezleri HTTPS'te güvenli işaretlenir ve giriş denemesi sınırı doğru IP'ye uygulanır).

### Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `3000` | Sunucu portu |
| `HOST` | `0.0.0.0` | Dinlenecek adres |
| `DATA_DIR` | `./data` | Veritabanı klasörü |
| `DB_FILE` | `$DATA_DIR/cari.db` | Veritabanı dosyası |
| `TRUST_PROXY` | kapalı | Ters vekil (nginx) arkasında `1` yapın |

## Yedekleme

Tüm veriler tek bir SQLite dosyasında (`data/cari.db`) tutulur. *Ayarlar → Yedek İndir* ile dosyayı indirebilir,
*Yedekten Geri Yükle* ile geri dönebilirsiniz. Sunucuda otomatik yedek için `data/` klasörünü düzenli olarak kopyalamanız yeterlidir.

## Hesap mantığı

- Cari bakiye **pozitif (B)** ise cari bize borçludur (alacağımız), **negatif (A)** ise biz cariye borçluyuz.
- Satış faturası ve ödeme yapma cariyi borçlandırır; alış faturası ve tahsilat cariyi alacaklandırır.
- Müşteriden alınan çek/senet cariyi hemen alacaklandırır ve portföye girer; karşılıksız çıkarsa cari tekrar borçlanır.
- Tutarlar kuruş hassasiyetinde tam sayı olarak saklanır; yuvarlama hatası oluşmaz.

## Geliştirme

```bash
npm run dev   # dosya değişince yeniden başlatır
npm test      # API testleri
```

Yapı: `server/` (Express + better-sqlite3 API, iş kuralları `server/services/`), `public/` (derleme gerektirmeyen JavaScript arayüz).
