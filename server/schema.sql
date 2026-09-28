-- Tüm tutarlar kuruş cinsinden INTEGER olarak saklanır (123,45 TL = 12345).
-- Tarihler 'YYYY-MM-DD' metni olarak saklanır.

CREATE TABLE IF NOT EXISTS ayarlar (
  anahtar TEXT PRIMARY KEY,
  deger   TEXT
);

CREATE TABLE IF NOT EXISTS oturumlar (
  token      TEXT PRIMARY KEY,
  olusturma  TEXT NOT NULL DEFAULT (datetime('now')),
  bitis      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cariler (
  id            INTEGER PRIMARY KEY,
  kod           TEXT UNIQUE,
  unvan         TEXT NOT NULL,
  tip           TEXT NOT NULL DEFAULT 'musteri' CHECK (tip IN ('musteri','tedarikci','her_ikisi')),
  yetkili       TEXT,
  telefon       TEXT,
  telefon2      TEXT,
  eposta        TEXT,
  adres         TEXT,
  il            TEXT,
  ilce          TEXT,
  vergi_dairesi TEXT,
  vergi_no      TEXT,
  tc_no         TEXT,
  iban          TEXT,
  doviz         TEXT NOT NULL DEFAULT 'TRY',
  risk_limiti   INTEGER NOT NULL DEFAULT 0,
  vade_gun      INTEGER NOT NULL DEFAULT 0,
  iskonto       REAL NOT NULL DEFAULT 0,
  grup          TEXT,
  notlar        TEXT,
  aktif         INTEGER NOT NULL DEFAULT 1,
  olusturma     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Kasa, banka, POS ve firma kredi kartı hesapları
CREATE TABLE IF NOT EXISTS hesaplar (
  id         INTEGER PRIMARY KEY,
  tip        TEXT NOT NULL CHECK (tip IN ('kasa','banka','pos','kart')),
  ad         TEXT NOT NULL,
  banka_adi  TEXT,
  sube       TEXT,
  hesap_no   TEXT,
  iban       TEXT,
  doviz      TEXT NOT NULL DEFAULT 'TRY',
  komisyon   REAL NOT NULL DEFAULT 0,     -- POS komisyon oranı (%)
  valor_gun  INTEGER NOT NULL DEFAULT 0,  -- POS bloke/valör günü
  bagli_banka_id INTEGER REFERENCES hesaplar(id),
  aktif      INTEGER NOT NULL DEFAULT 1,
  notlar     TEXT
);

-- Bir kullanıcı işlemi (tahsilat, ödeme, fatura, virman...) birden fazla kayıt üretebilir;
-- hepsi aynı "islem_id" ile bağlanır ve birlikte iptal edilir.
CREATE TABLE IF NOT EXISTS islemler (
  id         INTEGER PRIMARY KEY,
  tur        TEXT NOT NULL,
  tarih      TEXT NOT NULL,
  aciklama   TEXT,
  belge_no   TEXT,
  olusturma  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cari_hareketler (
  id          INTEGER PRIMARY KEY,
  islem_id    INTEGER REFERENCES islemler(id) ON DELETE CASCADE,
  cari_id     INTEGER NOT NULL REFERENCES cariler(id),
  tarih       TEXT NOT NULL,
  vade        TEXT,
  tur         TEXT NOT NULL,   -- acilis, satis_fatura, alis_fatura, tahsilat, odeme, satis_iade, alis_iade, cek_iade, mahsup, borc_dekont, alacak_dekont
  odeme_sekli TEXT,            -- nakit, kredi_karti, havale, cek, senet, mahsup, diger
  borc        INTEGER NOT NULL DEFAULT 0,
  alacak      INTEGER NOT NULL DEFAULT 0,
  aciklama    TEXT,
  belge_no    TEXT,
  hesap_id    INTEGER REFERENCES hesaplar(id),
  cek_id      INTEGER,
  fatura_id   INTEGER
);
CREATE INDEX IF NOT EXISTS ix_cari_hareket_cari ON cari_hareketler(cari_id, tarih);

CREATE TABLE IF NOT EXISTS hesap_hareketleri (
  id         INTEGER PRIMARY KEY,
  islem_id   INTEGER REFERENCES islemler(id) ON DELETE CASCADE,
  hesap_id   INTEGER NOT NULL REFERENCES hesaplar(id),
  tarih      TEXT NOT NULL,
  valor      TEXT,
  tur        TEXT NOT NULL,   -- tahsilat, odeme, virman, komisyon, gelir, gider, cek_tahsil, cek_odeme, acilis
  giris      INTEGER NOT NULL DEFAULT 0,
  cikis      INTEGER NOT NULL DEFAULT 0,
  aciklama   TEXT,
  cari_id    INTEGER REFERENCES cariler(id),
  kategori   TEXT
);
CREATE INDEX IF NOT EXISTS ix_hesap_hareket ON hesap_hareketleri(hesap_id, tarih);

CREATE TABLE IF NOT EXISTS cek_senet (
  id          INTEGER PRIMARY KEY,
  tur         TEXT NOT NULL CHECK (tur IN ('cek','senet')),
  yon         TEXT NOT NULL CHECK (yon IN ('alinan','verilen')),
  no          TEXT,
  banka       TEXT,
  sube        TEXT,
  hesap_no    TEXT,
  kesideci    TEXT,           -- çek keşidecisi / senet borçlusu
  kefil       TEXT,
  tutar       INTEGER NOT NULL,
  doviz       TEXT NOT NULL DEFAULT 'TRY',
  duzenleme   TEXT,
  vade        TEXT NOT NULL,
  durum       TEXT NOT NULL,  -- portfoy, tahsilde, ciro, tahsil, odendi, karsiliksiz, iade
  cari_id     INTEGER REFERENCES cariler(id),   -- alındığı / verildiği cari
  ciro_cari_id INTEGER REFERENCES cariler(id),  -- ciro edildiği cari
  hesap_id    INTEGER REFERENCES hesaplar(id),  -- tahsile verildiği / ödeneceği banka
  islem_id    INTEGER REFERENCES islemler(id) ON DELETE CASCADE,
  aciklama    TEXT
);
CREATE INDEX IF NOT EXISTS ix_cek_vade ON cek_senet(durum, vade);

CREATE TABLE IF NOT EXISTS cek_hareketleri (
  id         INTEGER PRIMARY KEY,
  cek_id     INTEGER NOT NULL REFERENCES cek_senet(id) ON DELETE CASCADE,
  islem_id   INTEGER REFERENCES islemler(id) ON DELETE CASCADE,
  tarih      TEXT NOT NULL,
  eski_durum TEXT,
  yeni_durum TEXT NOT NULL,
  aciklama   TEXT
);

CREATE TABLE IF NOT EXISTS urunler (
  id           INTEGER PRIMARY KEY,
  kod          TEXT UNIQUE,
  barkod       TEXT,
  ad           TEXT NOT NULL,
  grup         TEXT,
  birim        TEXT NOT NULL DEFAULT 'Adet',
  kdv          REAL NOT NULL DEFAULT 20,
  alis_fiyat   INTEGER NOT NULL DEFAULT 0,
  satis_fiyat  INTEGER NOT NULL DEFAULT 0,
  kritik_stok  REAL NOT NULL DEFAULT 0,
  aktif        INTEGER NOT NULL DEFAULT 1,
  notlar       TEXT
);

CREATE TABLE IF NOT EXISTS stok_hareketleri (
  id          INTEGER PRIMARY KEY,
  islem_id    INTEGER REFERENCES islemler(id) ON DELETE CASCADE,
  urun_id     INTEGER NOT NULL REFERENCES urunler(id),
  tarih       TEXT NOT NULL,
  tur         TEXT NOT NULL,  -- satis, alis, satis_iade, alis_iade, sayim, giris, cikis, acilis
  giris       REAL NOT NULL DEFAULT 0,
  cikis       REAL NOT NULL DEFAULT 0,
  birim_fiyat INTEGER NOT NULL DEFAULT 0,
  fatura_id   INTEGER,
  aciklama    TEXT
);
CREATE INDEX IF NOT EXISTS ix_stok_urun ON stok_hareketleri(urun_id, tarih);

CREATE TABLE IF NOT EXISTS faturalar (
  id           INTEGER PRIMARY KEY,
  islem_id     INTEGER REFERENCES islemler(id) ON DELETE SET NULL,
  tur          TEXT NOT NULL CHECK (tur IN ('satis','alis','satis_iade','alis_iade')),
  no           TEXT,
  cari_id      INTEGER NOT NULL REFERENCES cariler(id),
  tarih        TEXT NOT NULL,
  vade         TEXT,
  ara_toplam   INTEGER NOT NULL DEFAULT 0,
  iskonto      INTEGER NOT NULL DEFAULT 0,
  kdv_toplam   INTEGER NOT NULL DEFAULT 0,
  genel_toplam INTEGER NOT NULL DEFAULT 0,
  aciklama     TEXT,
  iptal        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fatura_kalemleri (
  id          INTEGER PRIMARY KEY,
  fatura_id   INTEGER NOT NULL REFERENCES faturalar(id) ON DELETE CASCADE,
  urun_id     INTEGER REFERENCES urunler(id),
  aciklama    TEXT NOT NULL,
  miktar      REAL NOT NULL,
  birim       TEXT,
  birim_fiyat INTEGER NOT NULL,
  iskonto     REAL NOT NULL DEFAULT 0,  -- satır iskontosu %
  kdv         REAL NOT NULL DEFAULT 20,
  tutar       INTEGER NOT NULL,         -- iskonto sonrası, KDV hariç
  kdv_tutar   INTEGER NOT NULL
);

-- İptal (ON DELETE CASCADE) ve işlem/fatura sorguları için
CREATE INDEX IF NOT EXISTS ix_cari_hareket_islem ON cari_hareketler(islem_id);
CREATE INDEX IF NOT EXISTS ix_cari_hareket_fatura ON cari_hareketler(fatura_id);
CREATE INDEX IF NOT EXISTS ix_hesap_hareket_islem ON hesap_hareketleri(islem_id);
CREATE INDEX IF NOT EXISTS ix_stok_islem ON stok_hareketleri(islem_id);
CREATE INDEX IF NOT EXISTS ix_cek_hareket_cek ON cek_hareketleri(cek_id);
CREATE INDEX IF NOT EXISTS ix_cek_hareket_islem ON cek_hareketleri(islem_id);
CREATE INDEX IF NOT EXISTS ix_cek_cari ON cek_senet(cari_id);
CREATE INDEX IF NOT EXISTS ix_cek_islem ON cek_senet(islem_id);
CREATE INDEX IF NOT EXISTS ix_fatura_kalem ON fatura_kalemleri(fatura_id);
CREATE INDEX IF NOT EXISTS ix_fatura_kalem_urun ON fatura_kalemleri(urun_id);
CREATE INDEX IF NOT EXISTS ix_fatura_cari ON faturalar(cari_id, tarih);
CREATE INDEX IF NOT EXISTS ix_fatura_islem ON faturalar(islem_id);
CREATE INDEX IF NOT EXISTS ix_islem_tarih ON islemler(tarih);
CREATE INDEX IF NOT EXISTS ix_cari_hareket_tarih ON cari_hareketler(tarih);
CREATE INDEX IF NOT EXISTS ix_hesap_hareket_tarih ON hesap_hareketleri(tarih);
CREATE INDEX IF NOT EXISTS ix_fatura_tarih ON faturalar(tarih);
