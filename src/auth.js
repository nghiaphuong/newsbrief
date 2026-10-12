const crypto = require('crypto');
const config = require('./config');

const COOKIE = 'nb_session';
const sign = v => crypto.createHmac('sha256', config.sessionSecret).update(v).digest('hex');

function makeToken() { const exp = Date.now() + 30 * 24 * 3600 * 1000; const v = `admin.${exp}`; return `${v}.${sign(v)}`; }
function verify(token) {
  if (!token) return false;
  const parts = token.split('.'); if (parts.length !== 3) return false;
  const v = `${parts[0]}.${parts[1]}`;
  const ok = crypto.timingSafeEqual(Buffer.from(sign(v)), Buffer.from(parts[2].padEnd(64, '0').slice(0, 64)));
  return ok && Number(parts[1]) > Date.now();
}
function safeEq(a, b) { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

function requireLogin(req, res, next) {
  if (!config.appPassword) return next(); // chưa đặt mật khẩu → chế độ phát triển
  if (verify(req.cookies[COOKIE])) return next();
  return res.status(401).json({ error: 'Chưa đăng nhập' });
}

function requireReadonlyToken(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  if (config.readonlyToken && t && safeEq(t, config.readonlyToken)) return next();
  return res.status(401).json({ error: 'Token không hợp lệ' });
}

function requireAgentToken(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (config.agentToken && t && safeEq(t, config.agentToken)) return next();
  return res.status(401).json({ error: 'Token không hợp lệ (AGENT_API_TOKEN)' });
}

module.exports = { COOKIE, makeToken, verify, safeEq, requireLogin, requireReadonlyToken, requireAgentToken };
