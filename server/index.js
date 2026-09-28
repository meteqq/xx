const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { open } = require('./db');
const auth = require('./auth');

function createApp() {
  open();
  const app = express();
  app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || true : false);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  app.use('/api/auth', auth.router);
  app.use('/api', auth.gerekli);
  app.use('/api/cariler', require('./routes/cariler'));
  app.use('/api/hesaplar', require('./routes/hesaplar'));
  app.use('/api/cekler', require('./routes/cekler'));
  app.use('/api/urunler', require('./routes/stok'));
  app.use('/api/faturalar', require('./routes/faturalar'));
  app.use('/api', require('./routes/genel'));
  app.use('/api', (req, res) => res.status(404).json({ hata: 'Bulunamadı' }));

  // Güncellemeden sonra telefonlarda eski JS/CSS kalmasın: her açılışta sunucuya sorulur (değişmediyse 304)
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    index: 'index.html',
    setHeaders: (res, file) => {
      res.setHeader('Cache-Control', /\.(woff2?|png|svg)$/.test(file) ? 'public, max-age=604800' : 'no-cache');
    },
  }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ? 400 : 500);
    if (status >= 500) console.error(err);
    const mesaj = status >= 500 ? 'Beklenmeyen bir hata oluştu' : err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ? 'Kayıt başka kayıtlarla ilişkili' : err.message;
    res.status(status).json({ hata: mesaj });
  });
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  const app = createApp();
  app.listen(port, host, () => {
    console.log(`Cari Takip çalışıyor: http://localhost:${port}`);
    for (const ip of yerelAdresler()) console.log(`Telefondan: http://${ip}:${port}`);
  });
  const httpsPort = Number(process.env.HTTPS_PORT) || (process.argv.includes('--https') ? 3443 : 0);
  if (httpsPort) {
    const { sertifika } = require('./sertifika');
    require('https').createServer(sertifika(yerelAdresler()), app).listen(httpsPort, host, () => {
      for (const ip of ['localhost', ...yerelAdresler()]) console.log(`HTTPS: https://${ip}:${httpsPort}`);
    });
  }
}

function yerelAdresler() {
  return Object.values(require('os').networkInterfaces()).flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
}

module.exports = { createApp };
