let yetkisizHandler = () => {};
export const yetkisiz = (fn) => { yetkisizHandler = fn; };

export async function api(method, url, body) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof FormData) opt.body = body;
  else if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch('/api' + url, opt);
  } catch {
    throw new Error('Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/auth/')) {
    yetkisizHandler();
    throw new Error(data.hata || 'Oturum süresi doldu');
  }
  if (!res.ok) throw new Error(data.hata || `Hata (${res.status})`);
  return data;
}

export const get = (u) => api('GET', u);
export const post = (u, b) => api('POST', u, b ?? {});
export const put = (u, b) => api('PUT', u, b ?? {});
export const del = (u) => api('DELETE', u);

// Sık kullanılan, az değişen veriler için basit önbellek
let hesapCache = null;
export async function hesaplar(yenile = false) {
  if (!hesapCache || yenile) hesapCache = await get('/hesaplar');
  return hesapCache;
}
export const hesapCacheTemizle = () => { hesapCache = null; };

let ayarCache = null;
export async function ayarlar(yenile = false) {
  if (!ayarCache || yenile) ayarCache = await get('/ayarlar');
  return ayarCache;
}
