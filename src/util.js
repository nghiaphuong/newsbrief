// Tiện ích ngày giờ theo múi giờ Oslo
const TZ = process.env.TZ || 'Europe/Oslo';
function ymd(d = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function viDate(s) { const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
function addDays(s, n) { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function osloHour(d = new Date()) { return parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(d), 10); }
function toMysql(d) { if (!d || isNaN(d)) return null; return d.toISOString().slice(0, 19).replace('T', ' '); }
async function pool(items, n, fn) {
  const results = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; results[idx] = await fn(items[idx], idx).catch(e => ({ error: e })); }
  }));
  return results;
}
module.exports = { ymd, viDate, addDays, osloHour, toMysql, pool };
