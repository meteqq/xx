// pm2 ile çalıştırma: pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [{
    name: 'cari',
    script: 'server/index.js',
    cwd: __dirname,
    instances: 1, // SQLite: tek süreç
    max_memory_restart: '400M',
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1', // yalnızca nginx erişir; port internete açılmaz
      PORT: 3100,
      TRUST_PROXY: 1,
      TZ: 'Europe/Istanbul',
    },
  }],
};
