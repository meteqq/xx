-- Netsis tablo yapısında küçük örnek veritabanı (aktarım testi için sahte veri)
CREATE TABLE TBLCASABIT (
  SUBE_KODU smallint DEFAULT 0, CARI_KOD varchar(35) NOT NULL PRIMARY KEY, CARI_ISIM varchar(100), CARI_TIP char(1),
  CARI_TEL varchar(20), CARI_IL varchar(15), CARI_ILCE varchar(15), CARI_ADRES varchar(100), VERGI_DAIRESI varchar(15),
  VERGI_NUMARASI varchar(15), EMAIL varchar(60), VADE_GUNU smallint, GRUP_KODU varchar(8), ISKONTO_ORANI float
);
INSERT INTO TBLCASABIT (CARI_KOD, CARI_ISIM, CARI_TIP, CARI_TEL, CARI_IL, CARI_ILCE, CARI_ADRES, VERGI_DAIRESI, VERGI_NUMARASI, EMAIL, VADE_GUNU, GRUP_KODU, ISKONTO_ORANI) VALUES
 ('120.01.001', 'Şahin Yapı Malzemeleri Ltd. Şti.', 'A', '0532 111 11 11', 'İzmir', 'Karşıyaka', 'Çiğli Cad. No:5', 'Karşıyaka', '1112223334', 'info@sahin.com', 30, 'BAYİ', 5),
 ('120.01.002', 'Ömer Çelik', 'A', '0544 222 22 22', 'Ankara', 'Çankaya', NULL, NULL, NULL, NULL, 0, NULL, 0),
 ('320.01.001', 'Özdemir Toptan Hırdavat A.Ş.', 'S', '0212 333 33 33', 'İstanbul', 'Şişli', NULL, 'Şişli', '9998887776', NULL, 45, NULL, 0);

CREATE TABLE TBLCASABITEK (CARI_KOD varchar(35), TCKIMLIKNO varchar(11));
INSERT INTO TBLCASABITEK VALUES ('120.01.002', '12345678901');

CREATE TABLE TBLCAHAR (
  INC_KEY_NUMBER int IDENTITY PRIMARY KEY, SUBE_KODU smallint DEFAULT 0, CARI_KOD varchar(35), TARIH datetime, VADE_TARIHI datetime,
  BELGE_NO varchar(15), ACIKLAMA varchar(50), BORC float, ALACAK float, HAREKET_TURU char(1)
);
INSERT INTO TBLCAHAR (CARI_KOD, TARIH, VADE_TARIHI, BELGE_NO, ACIKLAMA, BORC, ALACAK, HAREKET_TURU) VALUES
 ('120.01.001', '2026-01-01', '2026-01-01', 'DEVIR', 'Önceki yıldan devir', 15250.50, 0, 'A'),
 ('120.01.001', '2026-02-10', '2026-03-12', 'SF000001', 'Satış faturası', 11880, 0, 'B'),
 ('120.01.001', '2026-02-20', NULL, 'TM000001', 'Nakit tahsilat', 0, 5000, 'D'),
 ('120.01.001', '2026-03-01', '2026-06-30', 'MC000001', 'Müşteri çeki', 0, 12000, 'H'),
 ('120.01.002', '2026-03-05', '2026-03-05', 'SF000002', 'Perakende satış', 2376, 0, 'B'),
 ('120.01.002', '2026-03-05', NULL, 'TM000002', 'Kredi kartı', 0, 2376, 'D'),
 ('320.01.001', '2026-01-15', '2026-03-01', 'AF000001', 'Alış faturası', 0, 36000, 'B'),
 ('320.01.001', '2026-02-01', NULL, 'OD000001', 'Havale ödeme', 20000, 0, 'D'),
 ('320.01.001', '2026-03-10', '2026-06-30', 'MC000001', 'Çek ciro', 8000, 0, 'H'),
 ('120.99.999', '2026-03-15', NULL, 'X1', 'Kartı olmayan cari', 99.99, 0, 'B');

CREATE TABLE TBLSTSABIT (
  STOK_KODU varchar(35) PRIMARY KEY, STOK_ADI varchar(50), OLCU_BR1 varchar(3), KDV_ORANI float, SATIS_FIAT1 float, ALIS_FIAT1 float, GRUP_KODU varchar(8)
);
INSERT INTO TBLSTSABIT VALUES
 ('MTK-750', 'Darbeli Matkap 750W', 'AD', 20, 2650, 1800, 'ALET'),
 ('VD-440', 'Vida 4x40 (100''lü)', 'PK', 20, 75, 45, 'BAĞLANTI'),
 ('SLK-01', 'Silikon Şeffaf', 'AD', 20, 110.5, 65, NULL);

CREATE TABLE TBLSTSABITEK (STOK_KODU varchar(35), BARKOD1 varchar(35));
INSERT INTO TBLSTSABITEK VALUES ('MTK-750', '8691234567890'), ('VD-440', '8690000000017');

CREATE TABLE TBLSTHAR (
  INCKEYNO int IDENTITY PRIMARY KEY, STOK_KODU varchar(35), FISNO varchar(15), STHAR_GCMIK float, STHAR_GCKOD char(1), STHAR_TARIH datetime,
  STHAR_NF float, STHAR_KDV float, STHAR_FTIRSIP char(1), STHAR_ACIKLAMA varchar(35)
);
INSERT INTO TBLSTHAR (STOK_KODU, FISNO, STHAR_GCMIK, STHAR_GCKOD, STHAR_TARIH, STHAR_NF, STHAR_KDV, STHAR_FTIRSIP, STHAR_ACIKLAMA) VALUES
 ('MTK-750', 'DEVIR', 5, 'G', '2026-01-01', 1800, 20, NULL, NULL),
 ('MTK-750', 'AF000001', 10, 'G', '2026-01-15', 1800, 20, '2', '320.01.001'),
 ('VD-440', 'AF000001', 200, 'G', '2026-01-15', 45, 20, '2', '320.01.001'),
 ('MTK-750', 'SF000001', 3, 'C', '2026-02-10', 2650, 20, '1', '120.01.001'),
 ('VD-440', 'SF000001', 26, 'C', '2026-02-10', 75, 20, '1', '120.01.001'),
 ('SLK-01', 'SF000002', 18, 'C', '2026-03-05', 110, 20, '1', '120.01.002'),
 ('SLK-01', 'DEVIR', 40, 'G', '2026-01-01', 65, 20, NULL, NULL);

CREATE TABLE TBLFATUIRS (
  FTIRSIP char(1), FATIRS_NO varchar(15), CARI_KODU varchar(35), TARIH datetime, ODEMETARIHI datetime,
  BRUTTUTAR float, KDV float, GENELTOPLAM float, ACIKLAMA varchar(50)
);
INSERT INTO TBLFATUIRS VALUES
 ('1', 'SF000001', '120.01.001', '2026-02-10', '2026-03-12', 9900, 1980, 11880, NULL),
 ('1', 'SF000002', '120.01.002', '2026-03-05', '2026-03-05', 1980, 396, 2376, 'Perakende'),
 ('2', 'AF000001', '320.01.001', '2026-01-15', '2026-03-01', 27000, 5400, 32400, NULL),
 ('3', 'SI000001', '120.01.001', '2026-02-09', NULL, 100, 20, 120, 'İrsaliye — aktarılmamalı');

CREATE TABLE TBLMCEK (
  SC_NO varchar(15), SC_VERENK varchar(35), SC_VERILENK varchar(35), SC_TUTAR float, SC_VADE datetime, SC_GIRTRH datetime,
  SC_SONDUR char(1), SC_BANKA varchar(30), SC_BORCLU varchar(40)
);
INSERT INTO TBLMCEK VALUES
 ('MC000001', '120.01.001', '320.01.001', 8000, '2026-06-30', '2026-03-01', 'C', 'Garanti BBVA', 'Şahin Yapı'),
 ('MC000002', '120.01.001', NULL, 4000, '2026-07-15', '2026-03-01', 'P', 'İş Bankası', 'Şahin Yapı'),
 ('MC000003', '120.01.002', NULL, 1500, '2026-01-10', '2025-12-01', 'X', 'Akbank', 'Ömer Çelik');

CREATE TABLE TBLBCEK (SC_NO varchar(15), SC_VERILENK varchar(35), SC_TUTAR float, SC_VADE datetime, SC_GIRTRH datetime, SC_SONDUR char(1), SC_BANKA varchar(30));
INSERT INTO TBLBCEK VALUES ('BC000001', '320.01.001', 16000, '2026-05-20', '2026-02-01', 'P', 'Ziraat Bankası');

CREATE TABLE TBLKASMAS (KSMAS_KOD varchar(8), KSMAS_NAME varchar(30));
INSERT INTO TBLKASMAS VALUES ('01', 'Merkez Kasa'), ('02', 'Şube Kasası');

CREATE TABLE TBLKASA (KSMAS_KOD varchar(8), TARIH datetime, TUTAR float, IO char(1), ACIKLAMA varchar(50));
INSERT INTO TBLKASA VALUES
 ('01', '2026-01-01', 3000, 'G', 'Devir'),
 ('01', '2026-02-20', 5000, 'G', 'Şahin tahsilat'),
 ('01', '2026-02-25', 750.25, 'C', 'Kira'),
 ('02', '2026-03-01', 1200, 'G', 'Devir');
