import { get } from '../api.js';
import { e, icon, tl, tarih, bakiye } from '../ui.js';
import { HIZLI, renkStil } from '../sabitler.js';

export async function sayfa(ctx) {
  ctx.baslik('Ana Sayfa');
  const d = await get('/ozet');
  if (!ctx.guncel()) return;

  const tr = d.cariBakiye.find((x) => x.doviz === 'TRY') || { alacak: 0, borc: 0 };
  const nakit = d.hesaplar.filter((h) => h.doviz === 'TRY' && h.tip !== 'kart').reduce((a, h) => a + h.bakiye, 0);
  const stat = (href, lbl, val, cls = '') => `<a class="card stat" href="${href}" style="color:inherit;text-decoration:none">
    <span class="lbl">${lbl}</span><span class="val ${cls}">${val}</span></a>`;

  ctx.el.innerHTML = `
  <div class="quick">${HIZLI.map(([h, i, l, r]) => `<a href="${h}"><span class="ico" style="${renkStil(r)}">${icon(i)}</span>${e(l)}</a>`).join('')}</div>

  <div class="grid g3" style="margin-top:16px">
    ${stat('#/cariler?durum=borclu', 'Alacaklarım', tl(tr.alacak), 'neg')}
    ${stat('#/cariler?durum=alacakli', 'Borçlarım', tl(tr.borc), 'pos')}
    ${stat('#/kasa', 'Kasa + Banka', tl(nakit))}
  </div>

  <div class="grid g2" style="margin-top:16px">
    ${d.yaklasanCekler.length ? `<div class="card">
      <div class="card-h"><h3>Yaklaşan Vadeler</h3><a href="#/cekler" class="small">Tümü</a></div>
      <ul class="list">${d.yaklasanCekler.map((c) => `<li class="click" data-href="#/cek/${c.id}">
        <span class="ico ${c.yon === 'alinan' ? 'green' : 'red'}">${icon(c.tur === 'cek' ? 'cheque' : 'note')}</span>
        <div class="grow"><div class="t">${e(c.unvan || '-')}</div><div class="small ${c.vade < d.tarih ? 'neg' : 'muted'}">${tarih(c.vade)}</div></div>
        <div class="num" style="font-weight:700">${tl(c.tutar)}</div></li>`).join('')}</ul>
    </div>` : ''}
    ${d.enBorclu.length ? `<div class="card">
      <div class="card-h"><h3>Borçlu Cariler</h3><a href="#/cariler?durum=borclu" class="small">Tümü</a></div>
      <ul class="list">${d.enBorclu.map((c) => `<li class="click" data-href="#/cari/${c.id}">
        <div class="grow"><div class="t">${e(c.unvan)}</div></div><div>${bakiye(c.bakiye)}</div></li>`).join('')}</ul>
    </div>` : ''}
  </div>`;

  ctx.el.querySelectorAll('[data-href]').forEach((li) => li.addEventListener('click', () => { location.hash = li.dataset.href; }));
}
