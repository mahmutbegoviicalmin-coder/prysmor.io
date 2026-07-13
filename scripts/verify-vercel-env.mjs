import { readFileSync, unlinkSync } from 'node:fs';

const file = '.env.vercel.check';
const lines = readFileSync(file, 'utf8').split(/\r?\n/);
const keys = [
  'CRON_SECRET',
  'BLOB_READ_WRITE_TOKEN',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'KIE_API_BASE',
  'KIE_API_KEY',
  'CLERK_WEBHOOK_SECRET',
  'META_CAPI_TOKEN',
];

for (const key of keys) {
  const line = lines.find((l) => l.startsWith(`${key}=`));
  const raw = line ? line.slice(key.length + 1).replace(/^"|"$/g, '') : '';
  const status = raw ? `set (${raw.length} chars)` : 'EMPTY';
  console.log(`${key}: ${status}`);
  if (key.startsWith('KIE_') && raw.includes('\r')) console.log(`  WARN ${key} has trailing CR`);
}

try { unlinkSync(file); } catch {}
