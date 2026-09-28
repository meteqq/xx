import { get } from '../api.js';
import { e, icon, tl, tarih, bakiye } from '../ui.js';
import { HESAP_TIP } from '../sabitler.js';

export async function sayfa(ctx) {
  ctx.baslik('Güncel Durum');
  const d = await get('/ozet');
  if (!ctx.guncel()) return;

  const tr = d.cariBakiye.find((x) => x.doviz === 'TRY') || { alacak: 0, borc: 0 };
  const nakit = d.hesaplar.filter((h) => h.doviz === 'TRY' && h.tip !== 'kart').reduce((a, h) => a + h.bakiye, 0);
  const panel = (href, lbl, val, alt) => `<a class="card stat" href="${href}" style="color:inherit;text-decoration:none">
    <span class="lbl">${lbl}</span><span class="val">${val}</span><span class="sub">${alt}</span></a>`;

  ctx.el.innerHTML = `
  <div class="page-h"><h1>Güncel Durum</h1><div class="actions">
    <a class="btn" href="#/rapor/gunsonu">${icon('receipt')} Gün Sonu</a>
    <button class="btn green lg" data-aksiyon="satis">${icon('cash')} Satış Yap</button>
  </div></div>
  <div class="grid g4">
    ${panel('#/faturalar?tur=satis', 'Bugünkü satış', tl(d.bugunSatis.toplam), `${d.bugunSatis.adet} satış`)}
    ${panel('#/cariler?tip=musteri&durum=borclu', 'Tahsil edilecek', tl(tr.alacak),
      d.borcluSayisi ? `${d.borcluSayisi} cari` : '&nbsp;')}
    ${panel('#/cariler?tip=tedarikci&durum=alacakli', 'Ödenecek', tl(tr.borc),
      d.cek.verilen.adet ? `Çek / senet ${tl(d.cek.verilen.tutar)}` : '&nbsp;')}
    ${panel('#/kasa', 'Kasa ve bankalar', tl(nakit),
      d.cek.alinan.adet ? `Portföyde çek / senet ${tl(d.cek.alinan.tutar)}` : '&nbsp;')}
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card">
      <div class="card-h"><h3>Tahsilat bekleyenler</h3><a href="#/cariler?tip=musteri&durum=borclu" class="small">Tümü</a></div>
      ${d.enBorclu.length ? `<table class="tbl"><tbody>${d.enBorclu.map((c) => `<tr class="click" data-href="#/cari/${c.id}">
        <td>${e(c.unvan)}</td><td class="r">${bakiye(c.bakiye)}</td>
        <td class="r" style="width:1%"><button class="btn sm" data-aksiyon="tahsilat" data-cari="${c.id}">Tahsilat</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="empty small">Kayıt yok</div>'}
    </div>
    <div class="card">
      <div class="card-h"><h3>Kasa ve bankalar</h3><a href="#/kasa" class="small">Tümü</a></div>
      <table class="tbl"><tbody>${d.hesaplar.map((h) => `<tr class="click" data-href="#/hesap/${h.id}">
        <td>${e(h.ad)}<div class="small muted">${HESAP_TIP[h.tip][0]}</div></td>
        <td class="r num ${h.bakiye < 0 ? 'neg' : ''}">${tl(h.bakiye, h.doviz)}</td></tr>`).join('')}</tbody></table>
    </div>
  </div>

  ${d.yaklasanCekler.length ? `<div class="card" style="margin-top:16px">
    <div class="card-h"><h3>Vadesi yaklaşan çek ve senetler</h3><a href="#/cekler" class="small">Tümü</a></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Vade</th><th>Cari</th><th class="hide-m">Tür</th><th class="r">Tutar</th></tr></thead><tbody>
    ${d.yaklasanCekler.map((c) => `<tr class="click" data-href="#/cek/${c.id}">
      <td class="${c.vade < d.tarih ? 'neg' : ''}">${tarih(c.vade)}</td><td>${e(c.unvan || '-')}</td>
      <td class="muted hide-m">${c.yon === 'alinan' ? 'Alınan' : 'Verilen'} ${c.tur === 'cek' ? 'çek' : 'senet'}</td>
      <td class="r num">${tl(c.tutar)}</td></tr>`).join('')}</tbody></table></div>
  </div>` : ''}`;

  ctx.el.querySelectorAll('[data-href]').forEach((tr) => tr.addEventListener('click', (ev) => {
    if (ev.target.closest('button')) return;
    location.hash = tr.dataset.href;
  }));
}
