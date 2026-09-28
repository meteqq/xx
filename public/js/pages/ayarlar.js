import { get, put, post, api, ayarlar as ayarGetir } from '../api.js';
import { $, icon, toast, onayla, formOku, alanHtml, indir, temaDegistir } from '../ui.js';

const FIRMA = [
  { name: 'firma_unvan', label: 'Firma ünvanı', full: true },
  { name: 'firma_adres', label: 'Adres', type: 'textarea', full: true },
  { name: 'firma_telefon', label: 'Telefon' },
  { name: 'firma_eposta', label: 'E-posta' },
  { name: 'firma_vergi_dairesi', label: 'Vergi dairesi' },
  { name: 'firma_vergi_no', label: 'Vergi no' },
  { name: 'firma_iban', label: 'IBAN', full: true },
  { name: 'fatura_seri', label: 'Fatura seri öneki' },
  { name: 'fatura_notu', label: 'Fatura alt notu', type: 'textarea', full: true },
];

export async function sayfa(ctx) {
  ctx.baslik('Ayarlar');
  const a = await get('/ayarlar');
  if (!ctx.guncel()) return;
  ctx.el.innerHTML = `
    <div class="page-h"><h1>Ayarlar</h1></div>
    <div class="grid g2" style="align-items:start">
      <div class="card"><div class="card-h"><h3>Firma Bilgileri</h3></div><div class="card-b">
        <form id="firma" class="form-grid">${FIRMA.map((f) => alanHtml(f, a)).join('')}</form>
        <div style="margin-top:14px;text-align:right"><button class="btn primary" id="firma-kaydet">Kaydet</button></div>
      </div></div>
      <div>
        <div class="card"><div class="card-h"><h3>Yedekleme</h3></div><div class="card-b">
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn primary" id="yedek-al">${icon('download')} Yedek İndir</button>
            <label class="btn">${icon('upload')} Yedek Yükle<input type="file" id="yedek-yukle" accept=".db,.sqlite" hidden></label>
          </div>
        </div></div>
        <div class="card"><div class="card-h"><h3>Şifre Değiştir</h3></div><div class="card-b">
          <form id="sifre" class="form-grid">
            <label class="f full"><span>Mevcut şifre</span><input type="password" name="eski" autocomplete="current-password"></label>
            <label class="f"><span>Yeni şifre</span><input type="password" name="yeni" autocomplete="new-password"></label>
            <label class="f"><span>Yeni şifre tekrar</span><input type="password" name="yeni2" autocomplete="new-password"></label>
          </form>
          <div style="margin-top:14px;text-align:right"><button class="btn" id="sifre-kaydet">Şifreyi Değiştir</button></div>
        </div></div>
        <div class="card"><div class="card-h"><h3>Görünüm</h3></div><div class="card-b">
          <button class="btn" id="tema">${icon('moon')} Koyu / Açık</button>
        </div></div>
      </div>
    </div>`;

  $('#firma-kaydet').addEventListener('click', async () => {
    const v = formOku($('#firma'), FIRMA);
    await put('/ayarlar', v);
    await ayarGetir(true);
    const marka = $('.sidebar .brand small');
    if (marka) marka.textContent = v.firma_unvan;
    toast('Firma bilgileri kaydedildi', 'ok');
  });
  $('#yedek-al').addEventListener('click', () => indir('/api/yedek'));
  $('#tema').addEventListener('click', temaDegistir);
  $('#yedek-yukle').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    if (!await onayla('Mevcut veriler, yedekteki verilerle değiştirilecek.', { ok: 'Geri Yükle', tehlikeli: true })) return;
    const fd = new FormData();
    fd.append('dosya', file);
    try {
      await api('POST', '/yedek', fd);
      toast('Yedek geri yüklendi', 'ok');
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      toast(err.message, 'err');
    }
  });
  $('#sifre-kaydet').addEventListener('click', async () => {
    const f = $('#sifre');
    if (f.yeni.value !== f.yeni2.value) return toast('Yeni şifreler aynı değil', 'err');
    try {
      await post('/auth/sifre', { eski: f.eski.value, yeni: f.yeni.value });
      f.reset();
      toast('Şifre değiştirildi', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  });
}
