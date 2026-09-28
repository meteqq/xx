// Yazdırma şablonları (tarayıcının "PDF olarak kaydet" özelliğiyle PDF'e de dönüştürülebilir)
import { ayarlar } from './api.js';
import { e, tl, sayi, tarih, miktar, yazdir, bugun } from './ui.js';

function firmaBaslik(a, baslik, alt = '') {
  return `<div class="pr-head">
    <div><h1>${e(baslik)}</h1>${alt ? `<div>${e(alt)}</div>` : ''}</div>
    <div class="firma right"><b>${e(a.firma_unvan || '')}</b><br>${e(a.firma_adres || '')}
      ${a.firma_telefon ? `<br>Tel: ${e(a.firma_telefon)}` : ''}
      ${a.firma_vergi_no ? `<br>${e(a.firma_vergi_dairesi || '')} V.D. ${e(a.firma_vergi_no)}` : ''}</div>
  </div>`;
}

function hucre(k, v) {
  if (v === undefined || v === null || v === '') return '';
  if (k.type === 'money') return sayi(v);
  if (k.type === 'bakiye') return `${sayi(Math.abs(v))} ${v > 0 ? '(B)' : v < 0 ? '(A)' : ''}`;
  if (k.type === 'date') return tarih(v);
  if (k.type === 'number') return miktar(v);
  return e(v);
}

/** Ortak rapor yapısını yazdırır */
export async function raporYazdir(r, ek = '') {
  const a = await ayarlar();
  const sag = (k) => ['money', 'bakiye', 'number'].includes(k.type);
  yazdir(`${firmaBaslik(a, r.baslik, r.alt)}${ek}
    <table><thead><tr>${r.kolonlar.map((k) => `<th class="${sag(k) ? 'r' : ''}">${e(k.label)}</th>`).join('')}</tr></thead>
    <tbody>${r.satirlar.map((s) => `<tr>${r.kolonlar.map((k) => `<td class="${sag(k) ? 'r' : ''}">${hucre(k, s[k.key])}</td>`).join('')}</tr>`).join('')}</tbody>
    ${r.toplam ? `<tfoot><tr>${r.kolonlar.map((k, i) => `<td class="${sag(k) ? 'r' : ''}">${i === 0 && r.toplam[k.key] === undefined ? 'TOPLAM' : hucre(k, r.toplam[k.key])}</td>`).join('')}</tr></tfoot>` : ''}
    </table>
    <div class="note">Yazdırma tarihi: ${tarih(bugun())}</div>`);
}

/** Cari ekstresi: cari bilgisi + hareket tablosu + mutabakat alanı */
export async function ekstreYazdir(r) {
  const c = r.cari;
  const son = r.toplam.bakiye;
  const bilgi = `<div class="row2">
    <div class="box"><dl class="kv"><dt>Cari</dt><dd><b>${e(c.unvan)}</b></dd><dt>Kod</dt><dd>${e(c.kod || '')}</dd>
      ${c.adres ? `<dt>Adres</dt><dd>${e(c.adres)} ${e(c.ilce || '')} ${e(c.il || '')}</dd>` : ''}
      ${c.vergi_no ? `<dt>Vergi</dt><dd>${e(c.vergi_dairesi || '')} / ${e(c.vergi_no)}</dd>` : ''}
      ${c.telefon ? `<dt>Telefon</dt><dd>${e(c.telefon)}</dd>` : ''}</dl></div>
    <div class="box"><dl class="kv"><dt>Toplam Borç</dt><dd>${tl(r.toplam.borc, c.doviz)}</dd><dt>Toplam Alacak</dt><dd>${tl(r.toplam.alacak, c.doviz)}</dd>
      <dt>Bakiye</dt><dd><b>${tl(Math.abs(son), c.doviz)} ${son > 0 ? '(Borçlu)' : son < 0 ? '(Alacaklı)' : ''}</b></dd></dl></div>
  </div>`;
  await raporYazdir({ ...r, baslik: 'Cari Hesap Ekstresi' }, bilgi);
}

/** 80 mm termal yazıcı için satış fişi */
export async function fisYazdir(f) {
  const a = await ayarlar();
  const satir = (sol, sag, cls = '') => `<div class="fis-s ${cls}"><span>${sol}</span><span>${sag}</span></div>`;
  const kdvliFiyat = (k) => Math.round(k.birim_fiyat * (1 + k.kdv / 100));
  yazdir(`<style>@page { size: 80mm auto; margin: 3mm; }</style>
    <div class="fis">
      <div class="fis-baslik"><b>${e(a.firma_unvan || '')}</b>${a.firma_adres ? `<div>${e(a.firma_adres)}</div>` : ''}${a.firma_telefon ? `<div>Tel: ${e(a.firma_telefon)}</div>` : ''}</div>
      ${satir(tarih(f.tarih), e(f.no))}
      ${f.unvan && !/^Peşin Müşteri$/.test(f.unvan) ? `<div>${e(f.unvan)}</div>` : ''}
      <hr>
      ${f.kalemler.map((k) => `<div>${e(k.aciklama)}</div>${satir(`${miktar(k.miktar)} x ${sayi(kdvliFiyat(k))}`, sayi(k.tutar + k.kdv_tutar))}`).join('')}
      <hr>
      ${satir('KDV', sayi(f.kdv_toplam))}
      ${satir('TOPLAM', tl(f.genel_toplam), 'fis-top')}
      <div class="fis-alt">Teşekkür ederiz</div>
    </div>`);
}

/** Tahsilat / ödeme makbuzu */
export async function makbuzYazdir(i) {
  const a = await ayarlar();
  const tahsilat = i.tur === 'tahsilat';
  const anaCari = i.cari[0];
  const satirlar = i.cari.filter((h) => h.cari_id === anaCari.cari_id);
  const toplam = satirlar.reduce((s, h) => s + h.borc + h.alacak, 0);
  const html = `${firmaBaslik(a, tahsilat ? 'TAHSİLAT MAKBUZU' : 'ÖDEME MAKBUZU', `No: ${i.belge_no || i.id} · Tarih: ${tarih(i.tarih)}`)}
    <div class="box" style="margin-bottom:12px"><dl class="kv"><dt>${tahsilat ? 'Ödeyen' : 'Ödenen'}</dt><dd><b>${e(anaCari.unvan)}</b> (${e(anaCari.kod || '')})</dd>
      ${i.aciklama ? `<dt>Açıklama</dt><dd>${e(i.aciklama)}</dd>` : ''}</dl></div>
    <table><thead><tr><th>Ödeme Şekli</th><th>Açıklama</th><th>Vade</th><th class="r">Tutar</th></tr></thead>
    <tbody>${satirlar.map((h) => `<tr><td>${e(h.odeme_sekli_ad)}</td><td>${e(h.aciklama || '')}</td><td>${tarih(h.vade)}</td><td class="r">${sayi(h.borc + h.alacak)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="3">TOPLAM</td><td class="r">${tl(toplam)}</td></tr></tfoot></table>
    <p>Yalnız <b>${e(yaziyla(toplam))}</b> ${tahsilat ? 'tahsil edilmiştir' : 'ödenmiştir'}.</p>
    ${i.bakiye !== null ? `<p class="note">İşlem sonrası güncel bakiye: <b>${tl(Math.abs(i.bakiye))} ${i.bakiye > 0 ? '(Borçlu)' : i.bakiye < 0 ? '(Alacaklı)' : ''}</b></p>` : ''}
    <div class="sign"><div>Teslim Eden</div><div>Teslim Alan</div></div>`;
  yazdir(html + '<div style="border-top:1px dashed #999;margin:30px 0"></div>' + html);
}

/** Fatura çıktısı */
export async function faturaYazdir(f) {
  const a = await ayarlar();
  yazdir(`${firmaBaslik(a, f.tur_ad.toLocaleUpperCase('tr-TR'), `No: ${f.no} · Tarih: ${tarih(f.tarih)}${f.vade ? ' · Vade: ' + tarih(f.vade) : ''}`)}
    <div class="box" style="margin-bottom:12px"><dl class="kv"><dt>Sayın</dt><dd><b>${e(f.unvan)}</b></dd>
      ${f.adres ? `<dt>Adres</dt><dd>${e(f.adres)} ${e(f.ilce || '')} ${e(f.il || '')}</dd>` : ''}
      ${f.vergi_no || f.tc_no ? `<dt>Vergi D. / No</dt><dd>${e(f.vergi_dairesi || '')} ${e(f.vergi_no || f.tc_no)}</dd>` : ''}
      ${f.telefon ? `<dt>Telefon</dt><dd>${e(f.telefon)}</dd>` : ''}</dl></div>
    <table><thead><tr><th>#</th><th>Açıklama</th><th class="r">Miktar</th><th>Birim</th><th class="r">Birim Fiyat</th><th class="r">İsk.%</th><th class="r">KDV%</th><th class="r">Tutar</th></tr></thead>
    <tbody>${f.kalemler.map((k, n) => `<tr><td>${n + 1}</td><td>${e(k.aciklama)}</td><td class="r">${miktar(k.miktar)}</td><td>${e(k.birim || '')}</td>
      <td class="r">${sayi(k.birim_fiyat)}</td><td class="r">${k.iskonto || ''}</td><td class="r">${k.kdv}</td><td class="r">${sayi(k.tutar)}</td></tr>`).join('')}</tbody></table>
    <div class="totals"><div><span>Ara Toplam</span><span>${sayi(f.ara_toplam)}</span></div>
      ${f.iskonto ? `<div><span>İskonto</span><span>-${sayi(f.iskonto)}</span></div>` : ''}
      <div><span>KDV</span><span>${sayi(f.kdv_toplam)}</span></div>
      <div class="g"><span>Genel Toplam</span><span>${tl(f.genel_toplam)}</span></div></div>
    <p>Yalnız <b>${e(yaziyla(f.genel_toplam))}</b></p>
    ${f.aciklama ? `<p class="note">Not: ${e(f.aciklama)}</p>` : ''}
    ${a.fatura_notu ? `<p class="note">${e(a.fatura_notu)}</p>` : ''}
    ${a.firma_iban ? `<p class="note">IBAN: ${e(a.firma_iban)}</p>` : ''}
    <div class="sign"><div>Teslim Eden</div><div>Teslim Alan</div></div>`);
}

/** Tutarı Türkçe yazıya çevirir: 1234,50 → "BinİkiYüzOtuzDörtTL ElliKr" */
export function yaziyla(kurus) {
  const birler = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz'];
  const onlar = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan'];
  const buyuk = ['', 'Bin', 'Milyon', 'Milyar', 'Trilyon'];
  const uclu = (n) => {
    const y = Math.floor(n / 100);
    const o = Math.floor((n % 100) / 10);
    const b = n % 10;
    return (y ? (y > 1 ? birler[y] : '') + 'Yüz' : '') + onlar[o] + birler[b];
  };
  const yaz = (n) => {
    if (!n) return 'Sıfır';
    let s = '';
    let i = 0;
    while (n > 0) {
      const g = n % 1000;
      if (g) s = (i === 1 && g === 1 ? '' : uclu(g)) + buyuk[i] + s;
      n = Math.floor(n / 1000);
      i++;
    }
    return s;
  };
  const k = Math.abs(Math.round(kurus));
  const tl = Math.floor(k / 100);
  const kr = k % 100;
  return `${yaz(tl)}TL${kr ? ' ' + yaz(kr) + 'Kr' : ''}`;
}
