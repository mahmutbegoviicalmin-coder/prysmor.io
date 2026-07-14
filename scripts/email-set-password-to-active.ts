/**
 * Email set-password links to all active users who have not set a password yet.
 * Dry run: npx tsx scripts/email-set-password-to-active.ts --dry
 * Send:    npx tsx scripts/email-set-password-to-active.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import admin from 'firebase-admin';

const envCandidates = [
  path.join(__dirname, '..', '.env.vercel.local'),
  path.join(__dirname, '..', '.env.local'),
];
for (const envPath of envCandidates) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let val = m[2].trim().replace(/^["']|["']$/g, '');
    if (m[1] === 'FIREBASE_PRIVATE_KEY' || m[1].includes('PRIVATE_KEY')) {
      val = val.replace(/\\n/g, '\n');
    } else {
      val = val.replace(/\\r\\n/g, '').replace(/\\n/g, '').replace(/\\r/g, '').trim();
    }
    process.env[m[1]] = val;
  }
}

const dry = process.argv.includes('--dry');

const pk = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!admin.apps.length && pk) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID || 'prysmor-4841d',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL
        || 'firebase-adminsdk-fbsvc@prysmor-4841d.iam.gserviceaccount.com',
      privateKey: pk,
    }),
  });
}

async function main() {
  // Dynamic import after env load
  const { sendSetPasswordEmail } = await import('../lib/email/transactional');
  const db = admin.firestore();
  const snap = await db.collection('users').where('licenseStatus', '==', 'active').get();

  const targets: { id: string; email: string }[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const email = String(d.email || d.userEmail || '').toLowerCase();
    if (!email || !email.includes('@')) continue;
    if (email.includes('@example.com') || email.includes('@prysmor.io') && email.startsWith('activation.')) continue;
    if (typeof d.passwordHash === 'string' && d.passwordHash.length > 0) continue;
    targets.push({ id: doc.id, email });
  }

  console.log(`Active without password: ${targets.length}`);
  if (dry) {
    targets.forEach((t) => console.log(`  ${t.email}`));
    return;
  }

  let sent = 0;
  for (const t of targets) {
    const result = await sendSetPasswordEmail({ to: t.email, purpose: 'set-password' });
    if (result.ok) {
      sent += 1;
      console.log(`  sent ${t.email}`);
    } else {
      console.warn(`  fail ${t.email}: ${result.error}`);
    }
  }
  console.log(`Sent ${sent}/${targets.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
