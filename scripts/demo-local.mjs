#!/usr/bin/env node
/**
 * One command to see GhepGo on your own machine with demo data:
 *
 *   pnpm demo
 *
 * Starts PostgreSQL/PostGIS + Redis (docker compose) when they are not running, prepares apps/api/.env,
 * generates the Prisma client, applies migrations, seeds demo data once, then runs the API, the web app and
 * the demo drivers' GPS together and opens http://localhost:3000. Ctrl+C stops everything it started.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const api = path.join(root, 'apps/api');
const isWin = process.platform === 'win32';
const WEB_URL = 'http://localhost:3000';
const API_HEALTH = 'http://localhost:3001/api/health';
const children = [];

const say = (msg) => console.log(`\x1b[36m[demo]\x1b[0m ${msg}`);
class Abort extends Error {}
/** Prints the reason, stops everything started so far and aborts the current step. */
const fail = (msg) => {
  console.error(`\x1b[31m[demo] ${msg}\x1b[0m`);
  stopAll(1);
  throw new Abort(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin });
  return r.status === 0;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
    s.setTimeout(1000, () => (s.destroy(), resolve(false)));
  });
}

async function waitFor(check, seconds) {
  for (let i = 0; i < seconds; i++) {
    if (await check()) return true;
    await sleep(1000);
  }
  return false;
}

const httpOk = (url) => () => fetch(url).then((r) => r.status < 500).catch(() => false);

/** Runs a long-lived process with a coloured prefix on every output line. */
function start(name, color, cmd, args, cwd) {
  // Own process group, so stopping also reaches nest/next started underneath pnpm.
  const child = spawn(cmd, args, { cwd, shell: isWin, env: process.env, detached: !isWin });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) if (line.trim()) process.stdout.write(prefix + line + '\n');
    });
  }
  child.on('exit', (code) => {
    if (stopping) return;
    console.error(`\x1b[31m[demo] ${name} dừng (mã ${code}). Xem log phía trên.\x1b[0m`);
    stopAll(1);
  });
  children.push(child);
  return child;
}

let stopping = false;
function stopAll(code = 0) {
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null || !c.pid) continue;
    try {
      if (isWin) spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
      else process.kill(-c.pid, 'SIGINT');
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 1500);
}
process.on('SIGINT', () => {
  say('Đang dừng…');
  stopAll(0);
});

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : isWin ? 'start' : 'xdg-open';
  spawn(cmd, isWin ? ['""', url] : [url], { shell: isWin, stdio: 'ignore', detached: true }).on('error', () => {});
}

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) fail(`Cần Node.js 20 trở lên (đang dùng ${process.versions.node}).`);
  if (process.env.NODE_ENV === 'production') fail('Không chạy demo khi NODE_ENV=production.');

  if (!fs.existsSync(path.join(root, 'node_modules'))) {
    say('Cài thư viện (pnpm install)…');
    if (!run('pnpm', ['install'])) fail('pnpm install lỗi.');
  }

  const envFile = path.join(api, '.env');
  if (!fs.existsSync(envFile)) {
    fs.copyFileSync(path.join(api, '.env.example'), envFile);
    say('Đã tạo apps/api/.env từ .env.example.');
  }

  // PostgreSQL/PostGIS on 5434 and Redis on 6379, as in docker-compose.yml and .env.example.
  if (!(await portOpen(5434)) || !(await portOpen(6379))) {
    say('Bật PostgreSQL + Redis (docker compose up -d)…');
    if (!run('docker', ['compose', 'up', '-d'])) fail('Không chạy được docker compose. Mở Docker Desktop rồi chạy lại `pnpm demo`.');
  }
  if (!(await waitFor(async () => (await portOpen(5434)) && (await portOpen(6379)), 90))) fail('PostgreSQL (5434) hoặc Redis (6379) chưa lên sau 90 giây.');

  say('Chuẩn bị database…');
  if (!run('pnpm', ['--filter', 'api', 'exec', 'prisma', 'generate'])) fail('prisma generate lỗi.');
  // The container accepts TCP a moment before Postgres is ready: retry the migration briefly.
  let migrated = false;
  for (let i = 0; i < 10 && !migrated; i++) {
    migrated = run('pnpm', ['--filter', 'api', 'exec', 'prisma', 'migrate', 'deploy']);
    if (!migrated) await sleep(3000);
  }
  if (!migrated) fail('prisma migrate deploy lỗi.');

  say('Tạo dữ liệu demo (bỏ qua nếu đã có)…');
  if (!run('pnpm', ['--filter', 'api', 'demo:seed'])) fail('demo:seed lỗi.');

  if (await portOpen(3001)) fail('Cổng 3001 đang bận: tắt API đang chạy khác rồi thử lại.');
  if (await portOpen(3000)) fail('Cổng 3000 đang bận: tắt web đang chạy khác rồi thử lại.');

  start('api', '35', 'pnpm', ['--filter', 'api', 'start:dev'], root);
  start('web', '32', 'pnpm', ['--filter', 'web', 'dev'], root);
  say('Đợi API và web khởi động…');
  if (!(await waitFor(httpOk(API_HEALTH), 180))) fail('API chưa chạy sau 3 phút.');
  // After the API is up, dist/ (rebuilt by `nest start --watch`) contains the demo script again.
  start('gps', '33', 'node', ['dist/scripts/demo.js', 'drivers'], api);
  if (!(await waitFor(httpOk(WEB_URL), 180))) fail('Web chưa chạy sau 3 phút.');

  console.log(`
\x1b[1m GhepGo đang chạy: ${WEB_URL}\x1b[0m
 Mật khẩu mọi tài khoản: demo1234
   Admin   0900000001   (/admin, /admin/pricing, /admin/forecast, /admin/complaints, /admin/reports)
   Khách   0900000002   (/trips: chuyến đang chạy, lịch sử dài)
   Khách   0900000004   (/book: thử mã HELLO20)
   Tài xế  0900000021   (/driver)
 Ctrl+C để dừng tất cả.
`);
  openBrowser(WEB_URL);
}

main().catch((e) => {
  if (e instanceof Abort) return;
  console.error(`\x1b[31m[demo] ${e instanceof Error ? e.message : String(e)}\x1b[0m`);
  stopAll(1);
});
