import { get } from '../api.js';
import { e, icon, tl, tarih, bakiye, sayi } from '../ui.js';
import { HIZLI, renkStil, HESAP_TIP, CEK_DURUM } from '../sabitler.js';

const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export async function sayfa(ctx) {
  ctx.baslik('Ana Sayfa');
  const d = await get('/ozet');
  if (!ctx.guncel()) return;

  const tr = d.cariBakiye.find((x) => x.doviz === 'TRY') || { alacak: 0, borc: 0 };
  const diger = d.cariBakiye.filter((x) => x.doviz !== 'TRY' && (x.alacak || x.borc));
  const nakit = d.hesaplar.filter((h) => h.doviz === 'TRY' && h.tip !== 'kart').reduce((a, h) => a + h.bakiye, 0);
  const maxBar = Math.max(1, ...d.aylar.flatMap((a) => [a.satis, a.tahsilat]));

  ctx.el.innerHTML = `
  <div class="quick">${HIZLI.map(([h, i, l, r]) => `<a href="${h}"><span class="ico" style="${renkStil(r)}">${icon(i)}</span>${e(l)}</a>`).join('')}</div>

  <div class="grid g4" style="margin-top:16px">
    <a class="card stat" href="#/rapor/bakiye?durum=borclu" style="color:inherit;text-decoration:none">
      <span class="lbl">${icon('in')} Toplam Alacağımız</span><span class="val neg">${tl(tr.alacak)}</span>
      <span class="sub">Carilerin bize borcu</span></a>
    <a class="card stat" href="#/rapor/bakiye?durum=alacakli" style="color:inherit;text-decoration:none">
      <span class="lbl">${icon('out')} Toplam Borcumuz</span><span class="val pos">${tl(tr.borc)}</span>
      <span class="sub">Carilere borcumuz</span></a>
    <a class="card stat" href="#/kasa" style="color:inherit;text-decoration:none">
      <span class="lbl">${icon('wallet')} Kasa + Banka</span><span class="val">${tl(nakit)}</span>
      <span class="sub">TL hesapların toplamı</span></a>
    <a class="card stat" href="#/cekler" style="color:inherit;text-decoration:none">
      <span class="lbl">${icon('cheque')} Portföydeki Evrak</span><span class="val">${tl(d.cek.alinan.tutar)}</span>
      <span class="sub">${d.cek.alinan.adet} adet çek/senet</span></a>
  </div>
  ${diger.length ? `<div class="alert blue" style="margin-top:12px">Döviz cariler: ${diger.map((x) => `${x.doviz} alacak ${tl(x.alacak, x.doviz)} / borç ${tl(x.borc, x.doviz)}`).join(' · ')}</div>` : ''}

  ${uyarilar(d)}

  <div class="grid g4" style="margin-top:16px">
    <div class="card stat"><span class="lbl">Bugün Tahsilat</span><span class="val pos">${tl(d.bugun.tahsilat)}</span></div>
    <div class="card stat"><span class="lbl">Bugün Ödeme</span><span class="val neg">${tl(d.bugun.odeme)}</span></div>
    <div class="card stat"><span class="lbl">Bu Ay Satış</span><span class="val">${tl(d.ay.satis)}</span><span class="sub">Tahsilat: ${tl(d.ay.tahsilat)}</span></div>
    <div class="card stat"><span class="lbl">Bu Ay Alış</span><span class="val">${tl(d.ay.alis)}</span><span class="sub">Masraf: ${tl(d.ay.gider)}</span></div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card">
      <div class="card-h"><h3>Vadesi Yaklaşan / Geçen Evraklar</h3><a href="#/cekler" class="small">Tümü</a></div>
      ${d.yaklasanCekler.length ? `<ul class="list">${d.yaklasanCekler.map((c) => {
        const gecti = c.vade < d.tarih;
        return `<li class="click" data-href="#/cek/${c.id}"><span class="ico ${c.yon === 'alinan' ? 'green' : 'red'}">${icon(c.tur === 'cek' ? 'cheque' : 'note')}</span>
          <div class="grow"><div class="t">${e(c.unvan || '-')}</div><div class="small muted">${c.yon === 'alinan' ? 'Alınan' : 'Verilen'} ${c.tur === 'cek' ? 'çek' : 'senet'} · No ${e(c.no || '-')} · <span class="badge ${CEK_DURUM[c.durum][1]}">${CEK_DURUM[c.durum][0]}</span></div></div>
          <div class="right"><div class="num" style="font-weight:700">${tl(c.tutar)}</div><div class="small ${gecti ? 'neg' : 'muted'}">${gecti ? 'Vadesi geçti · ' : ''}${tarih(c.vade)}</div></div></li>`;
      }).join('')}</ul>` : '<div class="empty small">Önümüzdeki 15 gün içinde vadesi gelen evrak yok</div>'}
    </div>
    <div class="card">
      <div class="card-h"><h3>En Çok Borçlu Cariler</h3><a href="#/rapor/yaslandirma" class="small">Yaşlandırma</a></div>
      ${d.enBorclu.length ? `<ul class="list">${d.enBorclu.map((c) => `<li class="click" data-href="#/cari/${c.id}">
          <span class="ico">${icon('user')}</span><div class="grow"><div class="t">${e(c.unvan)}</div><div class="small muted">${e(c.telefon || '')}</div></div>
          <div>${bakiye(c.bakiye)}</div></li>`).join('')}</ul>` : '<div class="empty small">Borçlu cari yok</div>'}
    </div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card">
      <div class="card-h"><h3>Son 6 Ay</h3><div class="legend"><span><i style="background:var(--primary)"></i>Satış</span><span><i style="background:var(--green)"></i>Tahsilat</span></div></div>
      <div class="card-b"><div class="bars">${d.aylar.map((a) => `<div class="m" title="${AYLAR[Number(a.ay.slice(5)) - 1]}: Satış ${sayi(a.satis)} / Tahsilat ${sayi(a.tahsilat)}">
        <div class="pair"><div class="b s" style="height:${Math.max(0, a.satis) / maxBar * 100}%"></div><div class="b t" style="height:${a.tahsilat / maxBar * 100}%"></div></div>
        <div class="lbl">${AYLAR[Number(a.ay.slice(5)) - 1]}</div></div>`).join('')}</div></div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Kasa & Banka Hesapları</h3><a href="#/kasa" class="small">Tümü</a></div>
      <ul class="list">${d.hesaplar.map((h) => `<li class="click" data-href="#/hesap/${h.id}">
        <span class="ico ${h.tip === 'kasa' ? 'green' : h.tip === 'kart' ? 'red' : ''}">${icon(HESAP_TIP[h.tip][1])}</span>
        <div class="grow"><div class="t">${e(h.ad)}</div><div class="small muted">${HESAP_TIP[h.tip][0]}</div></div>
        <div class="num ${h.bakiye < 0 ? 'neg' : ''}" style="font-weight:700">${tl(h.bakiye, h.doviz)}</div></li>`).join('')}</ul>
    </div>
  </div>`;

  ctx.el.querySelectorAll('[data-href]').forEach((li) => li.addEventListener('click', () => { location.hash = li.dataset.href; }));
}

function uyarilar(d) {
  const u = [];
  if (d.cek.alinanGecmis.adet) u.push(['red', `Vadesi geçmiş ${d.cek.alinanGecmis.adet} alınan evrak var (${tl(d.cek.alinanGecmis.tutar)}). Tahsil edildiyse durumunu güncelleyin.`, '#/cekler?durum=acik&yon=alinan']);
  if (d.cek.verilenGecmis.adet) u.push(['red', `Vadesi geçmiş ${d.cek.verilenGecmis.adet} verilen evrak var (${tl(d.cek.verilenGecmis.tutar)}).`, '#/cekler?durum=acik&yon=verilen']);
  if (d.cek.verilen7.adet) u.push(['orange', `7 gün içinde ödenecek ${d.cek.verilen7.adet} evrak: ${tl(d.cek.verilen7.tutar)}`, '#/cekler?yon=verilen&durum=verildi']);
  if (d.cek.alinan7.adet) u.push(['blue', `7 gün içinde vadesi gelen ${d.cek.alinan7.adet} alınan evrak: ${tl(d.cek.alinan7.tutar)}`, '#/cekler?yon=alinan&durum=acik']);
  for (const r of d.riskAsan) u.push(['orange', `${r.unvan} risk limitini aştı (bakiye ${tl(r.bakiye)} / limit ${tl(r.risk_limiti)})`, `#/cari/${r.id}`]);
  if (d.kritikStok.length) u.push(['orange', `${d.kritikStok.length} ürün kritik stok seviyesinde: ${d.kritikStok.slice(0, 3).map((x) => x.ad).join(', ')}${d.kritikStok.length > 3 ? '...' : ''}`, '#/urunler?durum=kritik']);
  if (!u.length) return '';
  return `<div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">${u.map(([r, m, h]) => `<a class="alert ${r}" href="${h}" style="text-decoration:none">${icon('alert')}<span>${e(m)}</span></a>`).join('')}</div>`;
}
