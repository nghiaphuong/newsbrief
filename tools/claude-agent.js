#!/usr/bin/env node
// Cầu nối giữa tác vụ Claude Code (gói Claude Team/Pro) và server NewsBrief. Không cần cài thêm gói.
//   node tools/claude-agent.js pull [--limit 10]   → tải việc cần làm về .newsbrief/jobs.json
//   node tools/claude-agent.js push                → gửi .newsbrief/results.json lên server
// Cấu hình NEWSBRIEF_AGENT_TOKEN (và NEWSBRIEF_URL), tìm theo thứ tự:
//   1. biến môi trường của tiến trình;
//   2. biến môi trường người dùng Windows đã lưu bằng `setx` (đọc thẳng từ registry, nên dùng được ngay
//      cả khi Claude desktop đã mở từ trước) — lệnh setx lấy ở trang Cài đặt của web;
//   3. file .newsbrief-agent.env ở gốc repo hoặc ~/.newsbrief/agent.env (tùy chọn).
// NEWSBRIEF_URL mặc định là địa chỉ app trên Hostinger.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, '.newsbrief');
const JOBS = path.join(DIR, 'jobs.json');
const RESULTS = path.join(DIR, 'results.json');
const DEFAULT_URL = 'https://newsbrief.phuongcode.com';
const KEYS = ['NEWSBRIEF_URL', 'NEWSBRIEF_AGENT_TOKEN'];

function fromWindowsUserEnv(key) {
  if (process.platform !== 'win32') return '';
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(new RegExp(`${key}\\s+REG_(?:EXPAND_)?SZ\\s+(.*)`));
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

function fromFiles(key) {
  for (const f of [path.join(ROOT, '.newsbrief-agent.env'), path.join(os.homedir(), '.newsbrief', 'agent.env')]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, '');
    }
  }
  return '';
}

function loadConfig() {
  for (const k of KEYS) if (!process.env[k]) process.env[k] = fromWindowsUserEnv(k) || fromFiles(k);
  if (!process.env.NEWSBRIEF_URL) process.env.NEWSBRIEF_URL = DEFAULT_URL;
}

async function call(method, route, body) {
  const base = process.env.NEWSBRIEF_URL.replace(/\/+$/, '');
  const token = process.env.NEWSBRIEF_AGENT_TOKEN;
  if (!token) throw new Error('Chưa có NEWSBRIEF_AGENT_TOKEN. Vào trang web → Cài đặt → Chế độ xử lý tin → "Lệnh cài cho máy chạy Claude", chạy lệnh setx trong PowerShell một lần.');
  const res = await fetch(`${base}/api/agent${route}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Server ${res.status}: ${data.error || ''}`);
  return data;
}

const summary = r => `còn chờ trên server: ${r.articles} bài, ${r.translations} bản dịch, ${r.digests} bản tổng hợp`;

async function main() {
  loadConfig();
  const [cmd, ...args] = process.argv.slice(2);
  fs.mkdirSync(DIR, { recursive: true });
  if (cmd === 'pull') {
    const i = args.indexOf('--limit');
    const limit = i >= 0 ? args[i + 1] : 10;
    const jobs = await call('GET', `/jobs?limit=${encodeURIComponent(limit)}`);
    fs.writeFileSync(JOBS, JSON.stringify(jobs, null, 2));
    const n = jobs.articles.length + jobs.translations.length + jobs.digests.length;
    if (fs.existsSync(RESULTS)) fs.unlinkSync(RESULTS);
    console.log(n === 0 ? 'NO_JOBS – không có việc cần làm.' :
      `Đã tải ${jobs.articles.length} bài, ${jobs.translations.length} bản dịch, ${jobs.digests.length} bản tổng hợp vào ${path.relative(ROOT, JOBS)} (${summary(jobs.remaining)}).`);
  } else if (cmd === 'push') {
    const file = args[0] ? path.resolve(args[0]) : RESULTS;
    const body = JSON.parse(fs.readFileSync(file, 'utf8'));
    const r = await call('POST', '/results', body);
    const a = r.applied;
    console.log(`Đã gửi: ${a.articles} bài, ${a.skipped} bài loại, ${a.translations} bản dịch, ${a.digests} bản tổng hợp.`);
    if (a.errors.length) console.log('Lỗi:\n- ' + a.errors.join('\n- '));
    console.log(r.remaining.articles + r.remaining.translations + r.remaining.digests > 0 ? `MORE_JOBS – ${summary(r.remaining)}.` : 'ALL_DONE – hết việc.');
    fs.renameSync(file, path.join(DIR, 'last-sent.json')); // giữ bản gửi gần nhất để tra cứu khi cần
  } else {
    console.log('Dùng: node tools/claude-agent.js pull [--limit 10] | push [file]');
    process.exitCode = 1;
  }
}

main().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
