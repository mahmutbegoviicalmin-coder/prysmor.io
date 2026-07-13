/**
 * Backfill email_users index for existing Firestore users.
 * Usage: npx tsx --env-file=.env.local scripts/migrate-email-user-index.ts
 */
async function main() {
  const { db } = await import('../lib/firebaseAdmin');
  const { ensureEmailUserIndex, normalizeEmail } = await import('../lib/auth/identity');
  if (!db) throw new Error('Firebase not initialized');

  const snap = await db.collection('users').limit(2000).get();
  let indexed = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const email = normalizeEmail(doc.data()?.email as string | undefined);
    if (!email) {
      skipped += 1;
      continue;
    }
    await ensureEmailUserIndex(doc.id, email);
    indexed += 1;
  }

  console.log(JSON.stringify({ total: snap.size, indexed, skipped }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
