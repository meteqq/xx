import { get, post } from '../api.js';
import { e, $, $$, icon, tl, sayi, miktar, parseTL, parseNum, toast, modal, formModal, debounce, qs } from '../ui.js';
import { cariSecici } from './cariler.js';
import { fisYazdir } from '../yazdir.js';

const dahilFiyat = (u) => Math.round((u.satis_fiyat || 0) * (1 + (u.kdv ?? 20) / 100));

/** Hızlı satış penceresi: ürün ekle, ödeme şekline bas, bitti. */
export async function satisAc({ cariId, onKaydet } = {}) {
  let sepet = [];
  let cari = cariId ? await get(`/cariler/${cariId}`) : null;

  const m = modal({
    title: 'Satış',
    wide: 'xl',
    body: `<div class="satis">
      <div class="satis-sol">
        <div class="satis-ara ac">${icon('search')}<input id="s-ara" placeholder="Ürün adı veya barkod" autocomplete="off" enterkeyhint="done"><div class="ac-list hidden" id="s-sonuc"></div></div>
        <div id="s-sepet" class="sepet"></div>
      </div>
      <div class="satis-sag">
        <label class="f"><span>Müşteri</span><div id="s-cari"></div></label>
        <div class="satis-toplam"><span>Toplam</span><b id="s-toplam" class="num">0,00 ₺</b></div>
        <div class="satis-odeme">
          <button class="btn green lg" data-o="nakit">${icon('cash')} Nakit</button>
          <button class="btn primary lg" data-o="kredi_karti">${icon('card')} Kredi Kartı</button>
          <button class="btn orange lg" data-o="veresiye">${icon('user')} Veresiye</button>
          <button class="btn lg" data-o="parcali">${icon('swap')} Parçalı</button>
        </div>
      </div>
    </div>`,
  });
  m.el.querySelector('.modal').classList.add('satis-modal');
  const $m = (s) => $(s, m.el);
  const ara = $m('#s-ara');
  const sonucKutu = $m('#s-sonuc');

  const cariKutusu = () => cariSecici($m('#s-cari'), { secili: cari, onSec: (it) => { cari = it ? it.veri : null; } });
  cariKutusu();

  // ---------- Sepet ----------
  const toplam = () => sepet.reduce((a, s) => a + Math.round(s.miktar * s.fiyat), 0);
  function ciz() {
    const kap = $m('#s-sepet');
    if (!sepet.length) {
      kap.innerHTML = `<div class="empty">${icon('box')}<div>Sepet boş</div></div>`;
    } else {
      kap.innerHTML = sepet.map((s, i) => `<div class="sepet-satir" data-i="${i}">
        <div class="sp-ad"><b>${e(s.ad)}</b><span class="muted small">${sayi(s.fiyat)} / ${e(s.birim)}</span></div>
        <div class="stepper"><button type="button" data-a="-" aria-label="Azalt">${icon('minus')}</button><input data-a="m" inputmode="decimal" value="${miktar(s.miktar)}"><button type="button" data-a="+" aria-label="Artır">${icon('plus')}</button></div>
        <input class="money sp-fiyat" data-a="f" inputmode="decimal" value="${sayi(s.fiyat)}" aria-label="Fiyat">
        <div class="sp-tutar num">${sayi(Math.round(s.miktar * s.fiyat))}</div>
        <button type="button" class="btn ghost icon sm danger-text" data-a="x" aria-label="Sil">${icon('trash')}</button>
      </div>`).join('');
    }
    $m('#s-toplam').textContent = tl(toplam());
  }
  $m('#s-sepet').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-a]');
    if (!b) return;
    const i = Number(b.closest('[data-i]').dataset.i);
    if (b.dataset.a === '+') sepet[i].miktar += 1;
    if (b.dataset.a === '-') sepet[i].miktar = Math.max(1, sepet[i].miktar - 1);
    if (b.dataset.a === 'x') sepet.splice(i, 1);
    ciz();
  });
  $m('#s-sepet').addEventListener('change', (ev) => {
    const inp = ev.target.closest('input[data-a]');
    if (!inp) return;
    const s = sepet[Number(inp.closest('[data-i]').dataset.i)];
    if (inp.dataset.a === 'm') { const v = parseNum(inp.value); if (v > 0) s.miktar = v; }
    if (inp.dataset.a === 'f') { const v = parseTL(inp.value); if (v >= 0) s.fiyat = v; }
    ciz();
  });

  function ekle(u) {
    const var_ = u.urun_id && sepet.find((s) => s.urun_id === u.urun_id);
    if (var_) var_.miktar += 1;
    else sepet.push({ miktar: 1, ...u });
    ciz();
    ara.value = '';
    sonucKutu.classList.add('hidden');
    ara.focus();
  }
  const urunden = (u) => ({ urun_id: u.id, ad: u.ad, birim: u.birim, kdv: u.kdv, fiyat: dahilFiyat(u) });

  // ---------- Ürün arama / barkod ----------
  let sonuclar = [];
  let sira = 0;
  async function aramaYap() {
    const q = ara.value.trim();
    const no = ++sira;
    sonuclar = q ? (await get('/urunler?' + qs({ q }))).slice(0, 12) : [];
    if (no !== sira) return null;
    sonucKutu.innerHTML = sonuclar.map((u, i) => `<div class="ac-item" data-i="${i}"><div><div>${e(u.ad)}</div><div class="s">${e(u.kod || '')} · Stok ${miktar(u.miktar)}</div></div><div class="num"><b>${sayi(dahilFiyat(u))}</b></div></div>`).join('')
      + (q ? `<div class="ac-item" data-serbest><div>${icon('plus')} "${e(q)}" ekle</div></div>` : '');
    sonucKutu.classList.toggle('hidden', !q);
    return q;
  }
  const araGecikmeli = debounce(aramaYap, 150);
  ara.addEventListener('input', araGecikmeli);
  ara.addEventListener('keydown', async (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const q = await aramaYap();
    if (!q) return;
    const tam = sonuclar.find((u) => u.barkod === q || u.kod === q);
    if (tam || sonuclar.length) ekle(urunden(tam || sonuclar[0]));
  });
  sonucKutu.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    const it = ev.target.closest('.ac-item');
    if (!it) return;
    if (it.hasAttribute('data-serbest')) ekle({ urun_id: null, ad: ara.value.trim(), birim: 'Adet', kdv: 20, fiyat: 0 });
    else ekle(urunden(sonuclar[Number(it.dataset.i)]));
  });
  ara.addEventListener('blur', () => setTimeout(() => sonucKutu.classList.add('hidden'), 150));

  // ---------- Ödeme ----------
  async function kaydet(odeme, ek = {}) {
    if (!sepet.length) { toast('Sepete ürün ekleyin', 'err'); ara.focus(); return; }
    if (odeme === 'veresiye' && !cari) { toast('Veresiye için müşteri seçin', 'err'); $m('#s-cari input')?.focus(); return; }
    const dugmeler = $$('[data-o]', m.el);
    dugmeler.forEach((b) => { b.disabled = true; });
    try {
      const r = await post('/satis', {
        odeme, cari_id: cari?.id, ...ek,
        kalemler: sepet.map((s) => ({ urun_id: s.urun_id, aciklama: s.ad, miktar: s.miktar, birim: s.birim, birim_fiyat: s.fiyat, kdv: s.kdv })),
      });
      toast(`Satış kaydedildi · ${tl(r.toplam)}`, 'ok', { etiket: 'Fiş', fn: async () => fisYazdir(await get(`/faturalar/${r.fatura_id}`)) });
      sepet = [];
      cari = null;
      cariKutusu();
      ciz();
      ara.focus();
      onKaydet?.(r);
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      dugmeler.forEach((b) => { b.disabled = false; });
    }
  }
  $$('[data-o]', m.el).forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.o !== 'parcali') return kaydet(b.dataset.o);
    if (!sepet.length) return toast('Sepete ürün ekleyin', 'err');
    const tt = toplam();
    formModal({
      title: `Parçalı Ödeme · ${tl(tt)}`,
      kaydet: 'Satışı Tamamla',
      alanlar: [
        { name: 'nakit', label: 'Nakit', type: 'money' },
        { name: 'kart', label: 'Kredi kartı', type: 'money' },
        { type: 'html', full: true, html: '<div class="small muted" id="p-kalan"></div>' },
      ],
      onMount: (form) => {
        const guncelle = () => {
          const kalan = tt - (parseTL(form.nakit.value) || 0) - (parseTL(form.kart.value) || 0);
          $('#p-kalan', form).innerHTML = kalan > 0 ? `Veresiye: <b>${tl(kalan)}</b>` : kalan < 0 ? '<span class="neg">Tutar fazla</span>' : '';
        };
        form.addEventListener('input', guncelle);
      },
      onSubmit: async (d) => kaydet('parcali', { nakit: d.nakit || 0, kart: d.kart || 0 }),
    });
  }));

  ciz();
  setTimeout(() => ara.focus(), 60);
  return m;
}
