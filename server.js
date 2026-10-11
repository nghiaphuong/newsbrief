const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./src/config');
const { migrate } = require('./src/db');
const scheduler = require('./src/scheduler');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use((req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use('/api', require('./src/routes/api'));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', index: 'index.html' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

(async () => {
  try {
    await migrate();
    console.log('Database ready');
    scheduler.start();
  } catch (e) {
    console.error('Database error – kiểm tra biến DB_*:', e.message);
  }
  app.listen(config.port, () => console.log(`NewsBrief listening on ${config.port}`));
})();
