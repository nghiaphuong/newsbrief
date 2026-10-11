// Lịch tự động (giờ Oslo). Có cơ chế "bù" khi tiến trình khởi động lại sau giờ chạy.
const cron = require('node-cron');
const { q, getSettings } = require('./db');
const { runDaily } = require('./pipeline');
const { sendWeekly, lastWeekRange } = require('./weekly');
const { ymd, osloHour } = require('./util');

async function dailyDue() {
  const s = await getSettings();
  const hour = parseInt(s.daily_hour || '8', 10);
  if (osloHour() < hour) return false;
  const r = await q("SELECT id FROM runs WHERE kind = 'daily' AND status IN ('done','running') AND trigger_by IN ('schedule','cron') AND DATE(started_at) = ? LIMIT 1", [ymd()]);
  return r.length === 0;
}

async function weeklyDue() {
  const s = await getSettings();
  if (s.weekly_enabled !== '1') return false;
  const { from, to } = lastWeekRange();
  const r = await q("SELECT id FROM digests WHERE kind = 'weekly' AND date_from = ? AND date_to = ? LIMIT 1", [from, to]);
  return r.length === 0 && osloHour() >= 9; // gửi sau khi bản tin sáng thứ Hai đã chạy
}

async function tick(trigger = 'schedule') {
  try {
    if (await dailyDue()) await runDaily(trigger).catch(e => console.error('Daily run:', e.message));
    if (await weeklyDue()) await sendWeekly().then(r => console.log('Weekly sent to', r.sentTo)).catch(e => console.error('Weekly:', e.message));
  } catch (e) { console.error('Scheduler tick:', e.message); }
}

function start() {
  // Kiểm tra mỗi 10 phút: chạy bản tin khi đến/qua giờ hẹn mà hôm nay chưa chạy; gửi báo cáo tuần khi đến hạn.
  cron.schedule('*/10 * * * *', () => tick('schedule'), { timezone: 'Europe/Oslo' });
  setTimeout(() => tick('schedule'), 15000);
}

module.exports = { start, tick };
