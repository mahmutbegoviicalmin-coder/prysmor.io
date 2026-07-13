import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const envFile = readFileSync('.env.local', 'utf8');
const local = Object.fromEntries(
  envFile
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      let v = l.slice(i + 1).trim();
      if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
        v = v.slice(1, -1);
      }
      return [l.slice(0, i).trim(), v];
    }),
);

// Keys to sync from .env.local → Vercel (production + preview)
const SYNC_KEYS = [
  'CRON_SECRET',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'KV_REST_API_READ_ONLY_TOKEN',
  'KV_URL',
  'REDIS_URL',
  'BLOB_READ_WRITE_TOKEN',
  'KIE_API_BASE',
  'KIE_API_KEY',
  'META_CAPI_TOKEN',
];

const SKIP_IF_PLACEHOLDER = /PASTE_|your_random_hex_here/i;

function run(cmd, args, input) {
  const r = spawnSync(cmd, args, {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  return { code: r.status ?? 1, out: (r.stdout || '') + (r.stderr || '') };
}

function upsert(name, value, target) {
  run('npx', ['vercel', 'env', 'rm', name, target, '--yes']);
  const add = run('npx', ['vercel', 'env', 'add', name, target, '--force'], value + '\n');
  if (add.code !== 0) {
    console.error(`FAIL ${name} (${target}):`, add.out.trim());
    return false;
  }
  console.log(`OK ${name} (${target})`);
  return true;
}

for (const key of SYNC_KEYS) {
  let value = (local[key] || '').trim();
  if (!value || SKIP_IF_PLACEHOLDER.test(value)) {
    console.log(`SKIP ${key} (missing or placeholder)`);
    continue;
  }
  upsert(key, value, 'production');
  upsert(key, value, 'preview');
}
