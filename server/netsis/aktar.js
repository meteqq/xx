#!/usr/bin/env node
// Netsis → Cari Takip aktarım aracı
//
//   npm run netsis -- kesif  --sifre ... [--veritabani FIRMA2026]
//   npm run netsis -- aktar  --sifre ... --veritabani FIRMA2026 --deneme
//   npm run netsis -- aktar  --sifre ... --veritabani FIRMA2026 [--temizle]
//
// Bağlantı: --sunucu (localhost) --port (1433) --kullanici (sa) --sifre (veya NETSIS_SIFRE)
const path = require('path');
const { db, DATA_DIR } = require('../db');
const K = require('./kaynak');
const { KAYNAKLAR, EVRAK_TABLOLARI, EVRAK_DURUM, FATURA_TIPI, CARI_TIPI, BIRIM } = require('./esleme');

const ETIKET = {
  cari: 'Cari kartları', cariEk: 'Cari ek bilgileri (TC no)', cariHareket: 'Cari hareketleri', stok: 'Stok kartları',
  stokEk: 'Stok ek bilgileri (barkod)', stokHareket: 'Stok hareketleri', fatura: 'Faturalar', kasa: 'Kasa hareketleri',
  kasaTanim: 'Kasa tanımları', bankaTanim: 'Banka hesapları', bankaHareket: 'Banka hareketleri',
  musteriCek: 'Müşteri çekleri', musteriSenet: 'Müşteri senetleri', borcCek: 'Borç çekleri', borcSenet: 'Borç senetleri',
};

const kurus = (v) => Math.round((Number(v) || 0) * 100);
const gun = (d) => {
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return null;
};
const metin = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
const birimAd = (b) => { const t = metin(b); return t ? BIRIM[t.toLocaleUpperCase('tr-TR').replace(/İ/g, 'I')] || t : 'Adet'; };
const sayiYaz = (n) => new Intl.NumberFormat('tr-TR').format(n);
const tlYaz = (k) => `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(k / 100)} TL`;

function argumanlar(argv) {
  const [komut, ...geri] = argv;
  const o = { sifre: process.env.NETSIS_SIFRE };
  for (let i = 0; i < geri.length; i++) {
    const a = geri[i];
    if (!a.startsWith('--')) continue;
    const ad = a.slice(2);
    if (['deneme', 'temizle'].includes(ad)) o[ad] = true;
    else o[ad] = geri[++i];
  }
  return { komut, o };
}

// ---------- Keşif ----------
async function kesif(o) {
  const pool = await K.baglan(o);
  try {
    if (!o.veritabani) {
      const dbs = await K.netsisVeritabanlari(pool);
      console.log(dbs.length ? `Netsis veritabanları:\n  ${dbs.join('\n  ')}\n\nAktarım için --veritabani ile birini seçin (genelde en son yıl).`
        : 'Bu sunucuda Netsis veritabanı (TBLCASABIT içeren) bulunamadı.');
      return;
    }
    const y = await K.yapi(pool);
    console.log(`Veritabanı: ${o.veritabani}\n`);
    for (const anahtar of Object.keys(KAYNAKLAR)) {
      const c = K.coz(y, anahtar);
      if (!c.bulundu) { console.log(`  -  ${ETIKET[anahtar]}: tablo yok (${c.aranan.join(', ')})`); continue; }
      const n = await K.sayi(pool, c);
      const bos = Object.entries(c.alanlar).filter(([, k]) => !k).map(([h]) => h);
      if (c.eksik.length) console.log(`  ✘  ${ETIKET[anahtar]} (${c.tablo}): ${sayiYaz(n)} kayıt — KULLANILAMAZ, eksik kolon: ${c.eksik.join(', ')}`);
      else console.log(`  ✔  ${ETIKET[anahtar]} (${c.tablo}): ${sayiYaz(n)} kayıt${bos.length ? ` · bulunamayan isteğe bağlı alanlar: ${bos.join(', ')}` : ''}`);
    }
    const evrak = await Promise.all(EVRAK_TABLOLARI.map(async (t) => {
      const c = K.coz(y, t.anahtar);
      if (!c.bulundu || !c.alanlar.durum) return null;
      const r = await pool.request().query(`SELECT [${c.alanlar.durum}] d, COUNT(*) n FROM [${c.tablo}] GROUP BY [${c.alanlar.durum}]`);
      return `${ETIKET[t.anahtar]}: ${r.recordset.map((x) => `${x.d ?? '(boş)'}=${x.n}`).join(', ')}`;
    }));
    const ev = evrak.filter(Boolean);
    if (ev.length) console.log(`\nÇek/senet durum kodları (esleme.js > EVRAK_DURUM ile eşleşmeli):\n  ${ev.join('\n  ')}`);
  } finally {
    await pool.close();
  }
}

// ---------- Okuma ----------
async function hepsiniOku(o) {
  const pool = await K.baglan(o);
  try {
    const y = await K.yapi(pool);
    const c = Object.fromEntries(Object.keys(KAYNAKLAR).map((a) => [a, K.coz(y, a)]));
    if (!c.cari.bulundu || c.cari.eksik.length) throw new Error('Cari tablosu (TBLCASABIT) okunamadı. Önce "kesif" komutunu çalıştırın.');
    const veri = {};
    for (const a of Object.keys(KAYNAKLAR)) veri[a] = await K.oku(pool, c[a]);
    return { veri, cozum: c };
  } finally {
    await pool.close();
  }
}

// ---------- Yazma ----------
class DenemeBitti extends Error {
  constructor(sonuc) { super('deneme'); this.sonuc = sonuc; }
}

function temizle(d) {
  for (const t of ['cek_hareketleri', 'cek_senet', 'fatura_kalemleri', 'faturalar', 'stok_hareketleri', 'urunler',
    'hesap_hareketleri', 'cari_hareketler', 'islemler', 'cariler', 'hesaplar']) {
    d.prepare(`DELETE FROM ${t}`).run();
  }
}

function yaz(veri, { deneme, temizle: sil, veritabani }) {
  const d = db();
  const uyari = [];
  const s = { cari: 0, cariHareket: 0, stok: 0, stokHareket: 0, fatura: 0, evrak: 0, hesap: 0, hesapHareket: 0 };

  const calis = d.transaction(() => {
    const dolu = d.prepare(`SELECT (SELECT COUNT(*) FROM cariler WHERE kod IS NOT 'PERAKENDE') + (SELECT COUNT(*) FROM urunler)
      + (SELECT COUNT(*) FROM cari_hareketler) n`).get().n;
    if (dolu && !sil) throw new Error('Veritabanında kayıt var. Üzerine aktarmak için --temizle kullanın (önce otomatik yedek alınır).');
    if (sil) temizle(d);

    const islemId = d.prepare("INSERT INTO islemler (tur, tarih, aciklama) VALUES ('netsis', date('now','localtime'), ?)")
      .run(`Netsis aktarımı (${veritabani})`).lastInsertRowid;

    // --- Cariler
    const tc = new Map(veri.cariEk.map((r) => [metin(r.kod), metin(r.tc_no)]));
    const cariId = new Map();
    const cariEkle = d.prepare(`INSERT INTO cariler (kod, unvan, tip, telefon, il, ilce, adres, vergi_dairesi, vergi_no, tc_no, eposta, vade_gun, grup, iskonto, kaynak)
      VALUES (@kod, @unvan, @tip, @telefon, @il, @ilce, @adres, @vergi_dairesi, @vergi_no, @tc_no, @eposta, @vade_gun, @grup, @iskonto, 'netsis')`);
    for (const r of veri.cari) {
      const kod = metin(r.kod);
      if (!kod || cariId.has(kod)) continue;
      const id = cariEkle.run({
        kod, unvan: metin(r.unvan) || kod, tip: CARI_TIPI[metin(r.tip)?.[0]?.toUpperCase()] || 'her_ikisi',
        telefon: metin(r.telefon), il: metin(r.il), ilce: metin(r.ilce), adres: metin(r.adres), vergi_dairesi: metin(r.vergi_dairesi),
        vergi_no: metin(r.vergi_no), tc_no: tc.get(kod) || null, eposta: metin(r.eposta), vade_gun: Math.max(0, parseInt(r.vade_gun, 10) || 0),
        grup: metin(r.grup), iskonto: Math.min(99, Math.max(0, Number(r.iskonto) || 0)),
      }).lastInsertRowid;
      cariId.set(kod, id);
      s.cari++;
    }
    const cariBul = (kod) => {
      const k = metin(kod);
      if (!k) return null;
      if (!cariId.has(k)) {
        cariId.set(k, cariEkle.run({ kod: k, unvan: `${k} (Netsis)`, tip: 'her_ikisi', telefon: null, il: null, ilce: null, adres: null,
          vergi_dairesi: null, vergi_no: null, tc_no: null, eposta: null, vade_gun: 0, grup: null, iskonto: 0 }).lastInsertRowid);
        uyari.push(`Kartı olmayan cari kodu için kayıt açıldı: ${k}`);
      }
      return cariId.get(k);
    };

    // --- Stok kartları
    const barkod = new Map(veri.stokEk.map((r) => [metin(r.kod), metin(r.barkod)]));
    const urunId = new Map();
    const urunBirim = new Map(veri.stok.map((r) => [metin(r.kod), birimAd(r.birim)]));
    const urunEkle = d.prepare(`INSERT INTO urunler (kod, barkod, ad, grup, birim, kdv, alis_fiyat, satis_fiyat, kaynak)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'netsis')`);
    for (const r of veri.stok) {
      const kod = metin(r.kod);
      if (!kod || urunId.has(kod)) continue;
      urunId.set(kod, urunEkle.run(kod, metin(r.barkod) || barkod.get(kod) || null, metin(r.ad) || kod, metin(r.grup),
        birimAd(r.birim), Number(r.kdv) || 0, Math.max(0, kurus(r.alis_fiyat)), Math.max(0, kurus(r.satis_fiyat))).lastInsertRowid);
      s.stok++;
    }

    // --- Faturalar (arşiv: cari/stok hareketi üretmez, bunlar aşağıda Netsis hareketlerinden gelir)
    const kalemler = new Map();
    for (const r of veri.stokHareket) {
      if (!r.fisno || !r.ftirsip) continue;
      const k = `${String(r.ftirsip).trim()}|${String(r.fisno).trim()}`;
      if (!kalemler.has(k)) kalemler.set(k, []);
      kalemler.get(k).push(r);
    }
    const urunAd = new Map(veri.stok.map((r) => [metin(r.kod), metin(r.ad)]));
    const faturaAnahtar = new Map();
    const faturaEkle = d.prepare(`INSERT INTO faturalar (islem_id, tur, belge_tipi, no, cari_id, tarih, vade, ara_toplam, iskonto, kdv_toplam, genel_toplam, aciklama, kaynak)
      VALUES (?, ?, 'fatura', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'netsis')`);
    const kalemEkle = d.prepare(`INSERT INTO fatura_kalemleri (fatura_id, urun_id, aciklama, miktar, birim, birim_fiyat, iskonto, kdv, tutar, kdv_tutar)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`);
    for (const r of veri.fatura) {
      const tip = String(r.tip ?? '').trim();
      const tur = FATURA_TIPI[tip];
      const no = metin(r.no);
      if (!tur || !no) continue;
      const cid = cariBul(r.cari);
      if (!cid) continue;
      const brut = kurus(r.brut);
      const kdv = kurus(r.kdv);
      const genel = kurus(r.genel) || brut + kdv;
      const fid = faturaEkle.run(islemId, tur, no, cid, gun(r.tarih) || '1900-01-01', gun(r.vade), brut, Math.max(0, brut + kdv - genel), kdv, genel, metin(r.aciklama)).lastInsertRowid;
      for (const k of kalemler.get(`${tip}|${no}`) || []) {
        const m = Math.abs(Number(k.miktar) || 0);
        if (!m) continue;
        const kod = metin(k.kod);
        const tutar = Math.round(m * (Number(k.fiyat) || 0) * 100);
        const kdvO = Number(k.kdv) || 0;
        kalemEkle.run(fid, urunId.get(kod) || null, urunAd.get(kod) || kod || '-', m, urunBirim.get(kod) || 'Adet', kurus(k.fiyat), kdvO, tutar, Math.round(tutar * kdvO / 100));
      }
      faturaAnahtar.set(`${metin(r.cari)}|${no}`, fid);
      s.fatura++;
    }

    // --- Cari hareketleri (ekstre geçmişi ve bakiye)
    const chEkle = d.prepare(`INSERT INTO cari_hareketler (islem_id, cari_id, tarih, vade, tur, borc, alacak, aciklama, belge_no, fatura_id, kaynak)
      VALUES (?, ?, ?, ?, 'aktarim', ?, ?, ?, ?, ?, 'netsis')`);
    const ch = [...veri.cariHareket].sort((a, b) => (gun(a.tarih) || '').localeCompare(gun(b.tarih) || '') || (Number(a.sira) || 0) - (Number(b.sira) || 0));
    let netsisBakiye = 0;
    for (const r of ch) {
      const cid = cariBul(r.kod);
      if (!cid) continue;
      let borc = kurus(r.borc);
      let alacak = kurus(r.alacak);
      netsisBakiye += borc - alacak;
      if (borc < 0) { alacak -= borc; borc = 0; }
      if (alacak < 0) { borc -= alacak; alacak = 0; }
      if (!borc && !alacak) continue;
      const belge = metin(r.belge_no);
      chEkle.run(islemId, cid, gun(r.tarih) || '1900-01-01', gun(r.vade), borc, alacak,
        metin(r.aciklama) || belge || 'Netsis', belge, faturaAnahtar.get(`${metin(r.kod)}|${belge}`) || null);
      s.cariHareket++;
    }

    // --- Stok hareketleri (mevcut stok)
    const shEkle = d.prepare(`INSERT INTO stok_hareketleri (islem_id, urun_id, tarih, tur, giris, cikis, birim_fiyat, aciklama, kaynak)
      VALUES (?, ?, ?, 'aktarim', ?, ?, ?, ?, 'netsis')`);
    for (const r of veri.stokHareket) {
      const uid = urunId.get(metin(r.kod));
      const m = Math.abs(Number(r.miktar) || 0);
      if (!uid || !m) continue;
      const giris = String(r.gckod || '').trim().toUpperCase() === 'G';
      shEkle.run(islemId, uid, gun(r.tarih) || '1900-01-01', giris ? m : 0, giris ? 0 : m, Math.max(0, kurus(r.fiyat)),
        [metin(r.fisno), metin(r.cari)].filter(Boolean).join(' · ') || 'Netsis');
      s.stokHareket++;
    }

    // --- Çek / senet
    const bilinmeyen = new Map();
    const cekEkle = d.prepare(`INSERT INTO cek_senet (tur, yon, no, banka, sube, kesideci, tutar, doviz, duzenleme, vade, durum, cari_id, ciro_cari_id, islem_id, aciklama, kaynak)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'TRY', ?, ?, ?, ?, ?, ?, ?, 'netsis')`);
    const cekHar = d.prepare("INSERT INTO cek_hareketleri (cek_id, islem_id, tarih, yeni_durum, aciklama) VALUES (?, ?, date('now','localtime'), ?, 'Netsis aktarımı')");
    for (const t of EVRAK_TABLOLARI) {
      for (const r of veri[t.anahtar]) {
        const tutar = kurus(r.tutar);
        const vade = gun(r.vade);
        if (!tutar || !vade) continue;
        const kod = metin(r.durum)?.[0]?.toUpperCase();
        let durum = EVRAK_DURUM[t.yon][kod];
        if (!durum) {
          durum = t.yon === 'alinan' ? 'portfoy' : 'verildi';
          const a = `${ETIKET[t.anahtar]}: "${kod ?? ''}"`;
          bilinmeyen.set(a, (bilinmeyen.get(a) || 0) + 1);
        }
        const cid = cariBul(r.cari);
        const ciro = durum === 'ciro' ? cariBul(r.ciro_cari) : null;
        const no = [metin(r.seri), metin(r.no)].filter(Boolean).join(' ') || null;
        const id = cekEkle.run(t.tur, t.yon, no, metin(r.banka), metin(r.sube), metin(r.kesideci), tutar, gun(r.giris), vade, durum,
          cid, ciro, islemId, metin(r.aciklama)).lastInsertRowid;
        cekHar.run(id, islemId, durum);
        s.evrak++;
      }
    }
    for (const [a, n] of bilinmeyen) uyari.push(`Tanınmayan evrak durumu ${a} → ${n} evrak "bekliyor" sayıldı (esleme.js > EVRAK_DURUM)`);

    // --- Kasa ve bankalar
    const hesapEkle = d.prepare("INSERT INTO hesaplar (tip, ad, banka_adi, iban, kaynak) VALUES (?, ?, ?, ?, 'netsis')");
    const hhEkle = d.prepare(`INSERT INTO hesap_hareketleri (islem_id, hesap_id, tarih, tur, giris, cikis, aciklama, kaynak)
      VALUES (?, ?, ?, 'aktarim', ?, ?, ?, 'netsis')`);
    const hesapId = new Map();
    const hesapBul = (tip, kod, ad, banka, iban) => {
      const k = `${tip}|${metin(kod) || '-'}`;
      if (!hesapId.has(k)) {
        hesapId.set(k, hesapEkle.run(tip, ad || `${tip === 'kasa' ? 'Kasa' : 'Banka'} ${metin(kod) || ''}`.trim(), banka || null, iban || null).lastInsertRowid);
        s.hesap++;
      }
      return hesapId.get(k);
    };
    for (const r of veri.kasaTanim) hesapBul('kasa', r.kod, metin(r.ad));
    for (const r of veri.kasa) {
      const t = kurus(r.tutar);
      if (!t) continue;
      const giris = String(r.io || '').trim().toUpperCase() === 'G';
      hhEkle.run(islemId, hesapBul('kasa', r.kod), gun(r.tarih) || '1900-01-01', giris ? Math.abs(t) : 0, giris ? 0 : Math.abs(t), metin(r.aciklama));
      s.hesapHareket++;
    }
    for (const r of veri.bankaTanim) hesapBul('banka', r.kod, metin(r.ad), metin(r.banka), metin(r.iban));
    for (const r of veri.bankaHareket) {
      const t = kurus(r.tutar);
      if (!t) continue;
      const giris = String(r.ba || '').trim().toUpperCase() === 'B';
      hhEkle.run(islemId, hesapBul('banka', r.kod), gun(r.tarih) || '1900-01-01', giris ? Math.abs(t) : 0, giris ? 0 : Math.abs(t), metin(r.aciklama));
      s.hesapHareket++;
    }
    if (d.prepare("SELECT 1 FROM hesaplar WHERE tip = 'kasa' AND kaynak = 'netsis'").get()) {
      // Netsis kasası geldiyse, hiç kullanılmamış varsayılan kasayı kaldır (listede çift görünmesin)
      d.prepare(`DELETE FROM hesaplar WHERE kaynak IS NULL AND tip = 'kasa'
        AND id NOT IN (SELECT hesap_id FROM hesap_hareketleri) AND id NOT IN (SELECT hesap_id FROM cari_hareketler WHERE hesap_id IS NOT NULL)
        AND id NOT IN (SELECT hesap_id FROM cek_senet WHERE hesap_id IS NOT NULL)`).run();
    }
    if (!d.prepare("SELECT 1 FROM hesaplar WHERE tip = 'kasa'").get()) d.prepare("INSERT INTO hesaplar (tip, ad) VALUES ('kasa', 'Merkez Kasa')").run();

    // --- Kontrol toplamları
    const bizim = d.prepare("SELECT COALESCE(SUM(borc - alacak), 0) b FROM cari_hareketler WHERE kaynak = 'netsis'").get().b;
    const stok = d.prepare("SELECT COALESCE(SUM(giris - cikis), 0) m FROM stok_hareketleri WHERE kaynak = 'netsis'").get().m;
    const netsisStok = veri.stokHareket.reduce((a, r) => {
      const m = Math.abs(Number(r.miktar) || 0);
      return a + (String(r.gckod || '').trim().toUpperCase() === 'G' ? m : -m);
    }, 0);
    const sonuc = { s, uyari, netsisBakiye, bizimBakiye: bizim, netsisStok, bizimStok: stok };
    if (deneme) throw new DenemeBitti(sonuc);
    return sonuc;
  });

  try {
    return calis();
  } catch (e) {
    if (e instanceof DenemeBitti) return e.sonuc;
    throw e;
  }
}

function rapor({ s, uyari, netsisBakiye, bizimBakiye, netsisStok, bizimStok }, deneme) {
  console.log(`\n${deneme ? 'DENEME — hiçbir şey kaydedilmedi' : 'AKTARIM TAMAMLANDI'}\n`);
  console.log(`  Cari kartı        : ${sayiYaz(s.cari)}`);
  console.log(`  Cari hareketi     : ${sayiYaz(s.cariHareket)}`);
  console.log(`  Stok kartı        : ${sayiYaz(s.stok)}`);
  console.log(`  Stok hareketi     : ${sayiYaz(s.stokHareket)}`);
  console.log(`  Fatura (arşiv)    : ${sayiYaz(s.fatura)}`);
  console.log(`  Çek / senet       : ${sayiYaz(s.evrak)}`);
  console.log(`  Kasa / banka      : ${sayiYaz(s.hesap)} hesap, ${sayiYaz(s.hesapHareket)} hareket`);
  console.log('\n  Kontrol:');
  console.log(`  Cari bakiye toplamı  Netsis: ${tlYaz(netsisBakiye)}   Aktarılan: ${tlYaz(bizimBakiye)}   ${netsisBakiye === bizimBakiye ? '✔ tutuyor' : '✘ FARK VAR'}`);
  console.log(`  Stok miktar toplamı  Netsis: ${sayiYaz(netsisStok)}   Aktarılan: ${sayiYaz(bizimStok)}   ${Math.abs(netsisStok - bizimStok) < 1e-6 ? '✔ tutuyor' : '✘ FARK VAR'}`);
  if (uyari.length) console.log(`\n  Uyarılar:\n  - ${uyari.slice(0, 50).join('\n  - ')}${uyari.length > 50 ? `\n  ... ${uyari.length - 50} uyarı daha` : ''}`);
}

async function aktar(o) {
  if (!o.veritabani) throw new Error('--veritabani gerekli (liste için: kesif)');
  console.log(`Netsis okunuyor: ${o.veritabani} ...`);
  const { veri } = await hepsiniOku(o);
  if (o.temizle && !o.deneme) {
    const yedek = path.join(DATA_DIR, `netsis-oncesi-yedek-${Date.now()}.db`);
    await db().backup(yedek);
    console.log(`Mevcut veriler yedeklendi: ${yedek}`);
  }
  const sonuc = yaz(veri, o);
  rapor(sonuc, o.deneme);
  return sonuc;
}

async function main(argv = process.argv.slice(2)) {
  const { komut, o } = argumanlar(argv);
  if (komut === 'kesif') return kesif(o);
  if (komut === 'aktar') return aktar(o);
  console.log('Kullanım:\n  npm run netsis -- kesif --sifre SIFRE [--veritabani DB]\n  npm run netsis -- aktar --sifre SIFRE --veritabani DB [--deneme] [--temizle]');
  return null;
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`HATA: ${e.message}`);
    process.exit(1);
  });
}

module.exports = { main, aktar, kesif, yaz };
