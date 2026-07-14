/**
 * Delete inactive / unpaid Firestore users. Keeps active license holders + admin emails.
 * Run: npx tsx scripts/purge-inactive-users.ts
 * Dry run: npx tsx scripts/purge-inactive-users.ts --dry
 */
import * as fs from 'fs';
import * as path from 'path';
import admin from 'firebase-admin';

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
    }
  }
}

const ADMIN_EMAILS = new Set(['mahmutbegoviic.almin@gmail.com']);
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

const db = admin.firestore();

function emailKey(email: string): string {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

async function deleteUserDeep(userId: string, email: string | null) {
  const ref = db.collection('users').doc(userId);
  for (const sub of ['jobs', 'devices'] as const) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = await ref.collection(sub).limit(400).get();
      if (page.empty) break;
      const batch = db.batch();
      page.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      if (page.size < 400) break;
    }
  }
  await ref.delete().catch(() => {});

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const sessions = await db.collection('web_sessions').where('userId', '==', userId).limit(400).get();
    if (sessions.empty) break;
    const batch = db.batch();
    sessions.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (sessions.size < 400) break;
  }

  if (email) {
    await db.collection('email_users').doc(emailKey(email)).delete().catch(() => {});
  }

  for (const funnelId of ['unpaid-starter', 'starter-pro']) {
    await db.collection('email_enrollments').doc(`${userId}_${funnelId}`).delete().catch(() => {});
  }
}

async function main() {
  const snap = await db.collection('users').get();
  const toDelete: { id: string; email: string; plan: string; status: string }[] = [];
  const keep: string[] = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const email = String(d.email || d.userEmail || '').toLowerCase();
    const status = d.licenseStatus ?? 'inactive';
    if (email && ADMIN_EMAILS.has(email)) {
      keep.push(`${doc.id} admin ${email}`);
      continue;
    }
    if (status === 'active') {
      keep.push(`${doc.id} active ${email} ${d.plan}`);
      continue;
    }
    toDelete.push({ id: doc.id, email, plan: d.plan ?? 'unpaid', status });
  }

  console.log(`Scanned ${snap.size} users`);
  console.log(`Keep ${keep.length} (active + admin)`);
  console.log(`Delete ${toDelete.length} inactive`);
  if (dry) {
    console.log('DRY RUN — sample to delete:');
    toDelete.slice(0, 15).forEach((u) => console.log(`  ${u.id} ${u.email} ${u.plan} ${u.status}`));
    console.log('Kept sample:');
    keep.slice(0, 15).forEach((k) => console.log(`  ${k}`));
    return;
  }

  let deleted = 0;
  for (const u of toDelete) {
    await deleteUserDeep(u.id, u.email || null);
    deleted += 1;
    if (deleted % 25 === 0) console.log(`  deleted ${deleted}/${toDelete.length}`);
  }
  console.log(`Done. Deleted ${deleted}. Kept ${keep.length}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
