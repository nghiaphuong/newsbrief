const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./config');
const { DEFAULT_SOURCES } = require('./sources');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 8,
  charset: 'utf8mb4',
  timezone: 'local',
  dateStrings: true,
});

async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

const DEFAULT_SETTINGS = {
  articles_per_day: '20',
  daily_hour: '8',
  min_relevance: '45',
  weekly_enabled: '1',
  weekly_to: config.weeklyTo,
  ai_mode: 'api',            // api | claude_plan | free
  translate_provider: 'deepl', // deepl | google (chế độ free)
};

// Nâng cấp CSDL đã tạo từ phiên bản cũ (chỉ chạy khi còn thiếu).
async function upgradeSchema() {
  const cols = await q("SELECT COLUMN_NAME c, COLUMN_TYPE t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'articles'");
  const col = Object.fromEntries(cols.map(r => [r.c, r.t]));
  if (col.status && !col.status.includes("'skipped'")) {
    await q("ALTER TABLE articles MODIFY status ENUM('pending','processing','done','error','skipped') NOT NULL DEFAULT 'pending'");
  }
  if (!col.translate_requested) {
    await q('ALTER TABLE articles ADD COLUMN translate_requested TINYINT(1) NOT NULL DEFAULT 0 AFTER translation_vi');
  }
}

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  for (const stmt of sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) {
    await pool.query(stmt);
  }
  await upgradeSchema();
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await q('INSERT IGNORE INTO settings (k, v) VALUES (?, ?)', [k, v]);
  }
  for (const s of DEFAULT_SOURCES) {
    await q(
      'INSERT IGNORE INTO sources (name, url, lang, region, paywall, filter_keywords) VALUES (?,?,?,?,?,?)',
      [s.name, s.url, s.lang, s.region, s.paywall ? 1 : 0, s.filter === false ? 0 : 1]
    );
  }
}

async function getSettings() {
  const rows = await q('SELECT k, v FROM settings');
  const out = { ...DEFAULT_SETTINGS };
  rows.forEach(r => { out[r.k] = r.v; });
  return out;
}

async function setSetting(k, v) {
  await q('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, String(v)]);
}

module.exports = { pool, q, migrate, getSettings, setSetting };
