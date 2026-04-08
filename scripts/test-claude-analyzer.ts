/**
 * Direct integration test for Claude vision scene analysis.
 * Calls the Anthropic API directly — no web server required.
 *
 * Run:
 *   npx ts-node --project scripts/tsconfig.json scripts/test-claude-analyzer.ts
 */

import * as fs    from 'fs';
import * as path  from 'path';
import * as https from 'https';
import * as http  from 'http';

// ── Load ANTHROPIC_API_KEY from .env.local ────────────────────────────────────

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const match   = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
  if (match) {
    process.env.ANTHROPIC_API_KEY = match[1].trim().replace(/\r$/, '');
    console.log('Loaded ANTHROPIC_API_KEY from .env.local');
  } else {
    console.warn('ANTHROPIC_API_KEY not found in .env.local');
  }
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set — add it to .env.local');
  process.exit(1);
}
console.log(`API key: ${ANTHROPIC_API_KEY.slice(0, 20)}...`);

const TEST_IMAGE_URL  = 'https://picsum.photos/seed/prysmor/320/240';
const TEST_IMAGE_PATH = path.join(__dirname, '..', 'public', 'test-frame.jpg');

// ── Download helper ───────────────────────────────────────────────────────────

function downloadFile(url: string, dest: string, redirects = 0): Promise<void> {
  if (redirects > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http as unknown as typeof https;
    mod.get(url, { headers: { 'User-Agent': 'prysmor-test/1.0' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        downloadFile(res.headers.location, dest, redirects + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
    }).on('error', reject);
  });
}

// ── Call Anthropic directly ───────────────────────────────────────────────────

function callClaude(frameBase64: string, userPrompt: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:      'claude-opus-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type:   'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: frameBase64 },
            },
            {
              type: 'text',
              text: `You are an expert prompt engineer for Runway Gen-4 video-to-video AI generation.

Analyze this video frame and write a Runway Gen-4 prompt that preserves subject identity.

1. IDENTITY PRESERVATION (most critical):
   - Describe every person's exact facial features, skin tone, hair color/style/length
   - Describe exact clothing: colors, style, fit
   - Describe body positions, poses, expressions
   - Use phrase "preserve exact identity and appearance of all subjects from source video"

2. SCENE:
   - Lighting quality, direction, color temperature
   - Camera angle and framing
   - Color grading and mood

3. ENVIRONMENT:
   User request: "${userPrompt}"
   Apply environment change while keeping all subjects identical.

Output ONLY the final Runway prompt, no explanation. Start with:
"preserve exact identity and appearance of all subjects from source video,"`,
            },
          ],
        },
      ],
    });

    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path:     '/v1/messages',
        method:   'POST',
        headers:  {
          'Content-Type':      'application/json',
          'Content-Length':    Buffer.byteLength(body),
          'x-api-key':         ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try { resolve({ status: res.statusCode, data: JSON.parse(text) }); }
          catch { resolve({ status: res.statusCode, raw: text }); }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Ensure test image exists and is non-empty
  const needsDownload = !fs.existsSync(TEST_IMAGE_PATH)
    || fs.statSync(TEST_IMAGE_PATH).size === 0;

  if (needsDownload) {
    if (fs.existsSync(TEST_IMAGE_PATH)) fs.unlinkSync(TEST_IMAGE_PATH);
    console.log(`\nDownloading test image from:\n  ${TEST_IMAGE_URL}`);
    await downloadFile(TEST_IMAGE_URL, TEST_IMAGE_PATH);
    const kb = (fs.statSync(TEST_IMAGE_PATH).size / 1024).toFixed(1);
    console.log(`Saved: ${TEST_IMAGE_PATH} (${kb} KB)\n`);
  } else {
    const kb = (fs.statSync(TEST_IMAGE_PATH).size / 1024).toFixed(1);
    console.log(`\nUsing existing test image: ${TEST_IMAGE_PATH} (${kb} KB)\n`);
  }

  const frameBase64 = fs.readFileSync(TEST_IMAGE_PATH).toString('base64');
  console.log(`base64 length: ${frameBase64.length.toLocaleString()} chars\n`);

  const userPrompt = 'change background to New York city street, keep all people identical';
  console.log(`User prompt: "${userPrompt}"\n`);
  console.log('Calling Claude claude-opus-4-5 vision API...\n');

  const start  = Date.now();
  const result = await callClaude(frameBase64, userPrompt) as { status: number; data?: { content?: { type: string; text: string }[]; error?: { message: string } }; raw?: string };
  const ms     = Date.now() - start;

  console.log(`─── Response (${ms} ms) ${'─'.repeat(40)}`);
  console.log(`HTTP status : ${result.status}`);
  console.log('');

  if (result.data?.error) {
    console.error('API error:', result.data.error.message);
  } else if (result.data?.content) {
    const text = result.data.content.find((c) => c.type === 'text')?.text ?? '';
    console.log('Generated Runway prompt:\n');
    console.log(text);
    console.log('');
    console.log('Full response JSON:');
    console.log(JSON.stringify(result.data, null, 2));
  } else {
    console.log('Raw response:');
    console.log(result.raw ?? JSON.stringify(result.data, null, 2));
  }

  console.log(`${'─'.repeat(60)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nScript failed:', err.message);
    process.exit(1);
  });
