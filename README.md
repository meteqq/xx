# Cari Takip

Web tabanlı, telefondan ve bilgisayardan kullanılabilen cari hesap takip programı.

- **Hızlı satış (F2):** barkod okut / ürün seç, Nakit · Kredi Kartı · Veresiye · Parçalı ile tek tıkla satış, 80 mm fiş, Gün Sonu raporu
- **Çıktılar:** ekstre, fatura, fiş, makbuz ve raporlar için Yazdır · PDF · Excel · **Gönder** (telefonda WhatsApp/e-posta paylaşımı)
- **Netsis'ten aktarım:** cariler, tüm cari hareketleri (ekstre geçmişi), stoklar ve stok hareketleri, faturalar, çek/senetler, kasalar
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

Tarayıcıda `http://localhost:3000` adresini açın. İlk açılışta firma adınızı ve giriş şifrenizi belirlersiniz;
bunun için sunucunun açılırken konsola yazdığı **kurulum kodu** istenir (sunucuyu ilk açan yabancı şifre belirleyemesin diye).

Şifreyi unutursanız sunucuda: `npm run sifre -- YeniSifre`

Denemek için örnek verilerle başlamak isterseniz (boş veritabanında):

```bash
npm run demo
```

## Telefondan kullanım

Program sunucuya kurulduğunda telefonun tarayıcısından aynı adresle açılır ve telefon ekranına göre düzenlenir.
Uygulama gibi kullanmak için:

- **iPhone (Safari):** Paylaş → *Ana Ekrana Ekle*
- **Android (Chrome):** ⋮ menü → *Ana ekrana ekle*

Aynı ağdaki telefondan açmak için sunucu açılırken yazdığı `Telefondan: http://192.168.x.x:3000` adresini kullanın.

Telefonlar *ana ekrana ekleme* (tam ekran uygulama) ve *Gönder* paylaşım menüsünü yalnızca **HTTPS** adreslerde açar.
Yerel ağda bunun için:

```bash
npm run https
```

Sunucu `https://192.168.x.x:3443` adresini de yazar. Telefonda ilk açılışta çıkan güvenlik uyarısında
*Gelişmiş → Devam et* deyin (sertifika bu bilgisayarda üretilir, `data/https.json`), sonra ana ekrana ekleyin.
İnternetten erişilen bir sunucuda alan adı + Let's Encrypt (aşağıda) kullanın.

## Sunucuya kurulum (internetten erişim)

Başka sitelerin de çalıştığı bir Ubuntu sunucuda, alt alan adıyla (ör. `cari.alanadiniz.com`) kurulum:

**1. DNS:** alan adı panelinde `cari` için sunucunun IP'sine bir **A kaydı** ekleyin.

**2. Program** (Node.js 20+ gerekir: `node -v`; yoksa `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs`):

```bash
cd /opt && sudo git clone <depo-adresi> cari && sudo chown -R $USER cari && cd cari
npm ci --omit=dev
sudo npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 logs cari --lines 20     # "Kurulum kodu: ......" satırını not edin
pm2 save && pm2 startup      # sunucu yeniden başlayınca otomatik açılsın (çıkan komutu çalıştırın)
```

`ecosystem.config.cjs` programı yalnızca `127.0.0.1:3100`'de açar (dışarıdan erişilemez, diğer sitelerle çakışmaz),
saat dilimini `Europe/Istanbul` yapar ve `TRUST_PROXY=1` verir. Port 3100 doluysa dosyada değiştirin (nginx'te de).

**3. Nginx + HTTPS:**

```bash
sudo cp deploy/nginx-cari.conf /etc/nginx/sites-available/cari
sudo nano /etc/nginx/sites-available/cari        # cari.alanadiniz.com → kendi alan adınız
sudo ln -s /etc/nginx/sites-available/cari /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d cari.alanadiniz.com      # certbot yoksa: sudo apt install -y certbot python3-certbot-nginx
```

**4.** `https://cari.alanadiniz.com` adresini açın, kurulum kodu + firma adı + şifre ile başlayın.
Telefonda aynı adresi açıp *Ana ekrana ekle* deyin.

**5. Netsis aktarımı:** aşağıdaki "Netsis'ten aktarım" adımlarını sunucuda `/opt/cari` içinde çalıştırın, sonra `pm2 restart cari`.

**Güncelleme:**

```bash
cd /opt/cari && git pull && npm ci --omit=dev && pm2 restart cari
```

### Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `3000` | Sunucu portu |
| `HOST` | `0.0.0.0` | Dinlenecek adres |
| `HTTPS_PORT` | kapalı | Yerel ağ HTTPS portu (`npm run https` → `3443`) |
| `DATA_DIR` | `./data` | Veritabanı klasörü |
| `DB_FILE` | `$DATA_DIR/cari.db` | Veritabanı dosyası |
| `TRUST_PROXY` | kapalı | Ters vekil (nginx) arkasında `1` yapın |
| `TZ` | `Europe/Istanbul` | Tarihlerin hesaplandığı saat dilimi |
| `YEDEK_DIR` | `$DATA_DIR/yedekler` | Otomatik yedek klasörü |
| `YEDEK_GUN` | `30` | Saklanacak günlük yedek sayısı |
| `KURULUM_KODU` | rastgele | İlk kurulum kodu (verilmezse açılışta üretilip konsola yazılır) |

## Netsis'ten aktarım

Netsis verisi SQL Server'da durur; `.bak` yedeği önce bir SQL Server'a geri yüklenmelidir.

**1. Yedeği aç** (sunucuda Docker gerekir, ~2 GB bellek):

```bash
scripts/netsis-yedek-ac.sh /yol/NETSIS_FIRMA_2026.bak
```

Betik geçici bir SQL Server açar, yedeği yükler ve bağlantı bilgilerini (şifre dahil) ekrana yazar.
Docker yoksa: bir Windows bilgisayara ücretsiz **SQL Server Express** + **SSMS** kurup yedeği
*Databases → Restore Database* ile yükleyin; aşağıdaki komutlarda `--sunucu` olarak o bilgisayarın IP'sini verin.

**2. Keşif** — hangi tablolar bulundu, kaç kayıt var, çek/senet durum kodları neler:

```bash
NETSIS_SIFRE='...' npm run netsis -- kesif                        # veritabanlarını listeler
NETSIS_SIFRE='...' npm run netsis -- kesif --veritabani FIRMA2026
```

**3. Deneme** — hiçbir şey yazmadan sayıları ve kontrol toplamlarını gösterir:

```bash
NETSIS_SIFRE='...' npm run netsis -- aktar --veritabani FIRMA2026 --deneme
```

"Cari bakiye toplamı" ve "Stok miktar toplamı" satırlarında **✔ tutuyor** görünmeli; ayrıca birkaç carinin
bakiyesini Netsis raporlarıyla karşılaştırın.

**4. Aktar:**

```bash
NETSIS_SIFRE='...' npm run netsis -- aktar --veritabani FIRMA2026
```

- Aktarım tek seferde yapılır; hata olursa hiçbir şey yazılmaz.
- Programda kayıt varsa aktarım durur; üzerine yazmak için `--temizle` (önce otomatik yedek alınır).
- Tüm aktarılanlar *Hareketler* sayfasında tek bir "Netsis Aktarımı" işlemi olarak görünür.
- Netsis faturaları arşiv olarak gelir: görüntülenir, yazdırılır, gönderilir ama düzenlenemez.
- Netsis sürümüne göre kolon adı farklıysa ya da keşifte bir alan "bulunamayan" görünüyorsa
  `server/netsis/esleme.js` dosyasına kolon adını eklemek yeterlidir. Çek/senet durum kodları da orada eşlenir.
- İş bitince: `scripts/netsis-yedek-ac.sh --kapat`

## Yedekleme

Tüm veriler tek bir SQLite dosyasında (`data/cari.db`) tutulur.

- **Otomatik:** sunucu her gün `data/yedekler/cari-YYYY-MM-DD.db` yedeğini alır, son 30 günü saklar.
- **Elle:** *Ayarlar → Yedek İndir*. *Yedek Yükle* ile geri dönülür; yüklemeden önceki veriler
  `data/yedekler/geri-yukleme-oncesi-*.db` olarak saklanır.
- Yedekler aynı diskte durduğu için arada bir sunucu dışına da alın (ör. bilgisayarınızdan
  `scp sunucu:/opt/cari/data/yedekler/cari-*.db .` ya da *Yedek İndir*).

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
