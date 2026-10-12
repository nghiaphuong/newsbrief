#!/usr/bin/env node
// Cầu nối giữa tác vụ Claude Code (gói Claude Team/Pro) và server NewsBrief. Không cần cài thêm gói.
//   node tools/claude-agent.js pull [--limit 10]   → tải việc cần làm về .newsbrief/jobs.json
//   node tools/claude-agent.js push                → gửi .newsbrief/results.json lên server
// Cấu hình: biến môi trường NEWSBRIEF_URL, NEWSBRIEF_AGENT_TOKEN, hoặc file .newsbrief-agent.env ở gốc repo.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, '.newsbrief');
const JOBS = path.join(DIR, 'jobs.json');
const RESULTS = path.join(DIR, 'results.json');

function loadEnvFile() {
  const f = path.join(ROOT, '.newsbrief-agent.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function call(method, route, body) {
  const base = (process.env.NEWSBRIEF_URL || '').replace(/\/+$/, '');
  const token = process.env.NEWSBRIEF_AGENT_TOKEN;
  if (!base || !token) throw new Error('Thiếu NEWSBRIEF_URL hoặc NEWSBRIEF_AGENT_TOKEN (đặt trong .newsbrief-agent.env)');
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
  loadEnvFile();
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
