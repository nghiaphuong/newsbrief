// Lịch tự động (giờ Oslo). Có cơ chế "bù" khi tiến trình khởi động lại sau giờ chạy.
// Trên Hostinger, tiến trình Node chỉ chạy khi có truy cập và tự dừng khi rảnh, nên bộ hẹn giờ trong
// tiến trình không đủ: cần Cron Job của Hostinger gọi /api/cron/tick vài phút một lần (xem README).
const cron = require('node-cron');
const { q, getSettings, withLock } = require('./db');
const { runDaily, recoverInterrupted } = require('./pipeline');
const { sendWeekly, lastWeekRange } = require('./weekly');
const { ymd, osloHour } = require('./util');

const MAX_FAILED_RUNS_PER_DAY = 3; // tránh chạy lại vô hạn (tốn chi phí) khi lỗi lặp lại

async function dailyDue() {
  const s = await getSettings();
  if (s.daily_auto !== '1') return false; // tự động cập nhật hằng ngày đang tắt (mặc định)
  const hour = parseInt(s.daily_hour || '8', 10);
  if (osloHour() < hour) return false;
  const [r] = await q(`SELECT SUM(status IN ('done','running')) ok, SUM(status = 'error') failed FROM runs
      WHERE kind = 'daily' AND trigger_by IN ('schedule','cron') AND DATE(started_at) = ?`, [ymd()]);
  return !Number(r.ok) && Number(r.failed || 0) < MAX_FAILED_RUNS_PER_DAY;
}

async function weeklyDue() {
  const s = await getSettings();
  if (s.weekly_enabled !== '1') return false;
  const { from, to } = lastWeekRange();
  const r = await q("SELECT id FROM digests WHERE kind = 'weekly' AND date_from = ? AND date_to = ? LIMIT 1", [from, to]);
  return r.length === 0 && osloHour() >= 9; // gửi sau khi bản tin sáng thứ Hai đã chạy
}

// Chạy các việc đã đến hạn. An toàn khi gọi nhiều lần / từ nhiều tiến trình: mỗi việc chỉ chạy một lần.
async function tick(trigger = 'schedule') {
  const started = { daily: false, weekly: false };
  try {
    const recovered = await recoverInterrupted();
    if (recovered) console.log(`Scheduler: ${recovered} lượt cập nhật bị gián đoạn, sẽ chạy lại.`);
    if (await dailyDue()) {
      started.daily = true;
      runDaily(trigger).catch(e => console.error('Daily run:', e.message));
    }
    if (await weeklyDue()) {
      started.weekly = true;
      withLock('newsbrief_weekly', async () => { if (await weeklyDue()) return sendWeekly(); })
        .then(r => { if (r.result) console.log('Weekly sent to', r.result.sentTo); })
        .catch(e => console.error('Weekly:', e.message));
    }
  } catch (e) { console.error('Scheduler tick:', e.message); }
  return started;
}

function start() {
  // Kiểm tra mỗi 10 phút khi tiến trình đang chạy; Cron Job của Hostinger gọi /api/cron/tick để đánh thức khi tiến trình đã dừng.
  cron.schedule('*/10 * * * *', () => tick('schedule'), { timezone: 'Europe/Oslo' });
  setTimeout(() => tick('schedule'), 15000);
}

module.exports = { start, tick };
