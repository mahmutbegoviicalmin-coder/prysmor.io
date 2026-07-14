/**
 * Backfill Lemon Squeezy billing city/region/country onto active users.
 * Resolves customer via lsCustomerId, lsSubscriptionId, lsOrderId, or purchase_claims.
 * Run: npx tsx scripts/backfill-ls-billing.ts
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
      // JWT / API tokens: strip escaped newlines Vercel sometimes appends
      val = val.replace(/\\r\\n/g, '').replace(/\\n/g, '').replace(/\\r/g, '').trim();
    }
    process.env[m[1]] = val;
  }
}

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
const LS_API = 'https://api.lemonsqueezy.com';

function lsHeaders() {
  const key = process.env.LEMONSQUEEZY_API_KEY;
  if (!key) throw new Error('LEMONSQUEEZY_API_KEY missing');
  return {
    Authorization: `Bearer ${key}`,
    Accept: 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
  };
}

function isSimId(id: string | null | undefined): boolean {
  return !id || String(id).startsWith('sim_');
}

async function resolveCustomerId(
  userId: string,
  d: Record<string, any>,
): Promise<string | null> {
  if (d.lsCustomerId && !isSimId(String(d.lsCustomerId))) return String(d.lsCustomerId);

  if (d.lsSubscriptionId && !isSimId(String(d.lsSubscriptionId))) {
    const res = await fetch(`${LS_API}/v1/subscriptions/${d.lsSubscriptionId}`, { headers: lsHeaders() });
    if (res.ok) {
      const json = await res.json();
      const cid = json?.data?.attributes?.customer_id;
      if (cid != null) return String(cid);
    } else {
      console.warn(`  sub ${d.lsSubscriptionId} → HTTP ${res.status}`);
    }
  }

  if (d.lsOrderId && !isSimId(String(d.lsOrderId))) {
    const res = await fetch(`${LS_API}/v1/orders/${d.lsOrderId}`, { headers: lsHeaders() });
    if (res.ok) {
      const json = await res.json();
      const cid = json?.data?.attributes?.customer_id;
      if (cid != null) return String(cid);
    } else {
      console.warn(`  order ${d.lsOrderId} → HTTP ${res.status}`);
    }
  }

  // purchase_claims by userId
  const byUser = await db.collection('purchase_claims').where('userId', '==', userId).limit(3).get();
  for (const c of byUser.docs) {
    const cid = c.data()?.customerId;
    if (cid && !isSimId(String(cid))) return String(cid);
  }

  // billing_subscriptions by userId
  const bySub = await db.collection('billing_subscriptions').where('userId', '==', userId).limit(3).get();
  for (const c of bySub.docs) {
    const cid = c.data()?.customerId;
    if (cid && !isSimId(String(cid))) return String(cid);
  }

  return null;
}

async function fetchBilling(customerId: string) {
  const res = await fetch(`${LS_API}/v1/customers/${customerId}`, { headers: lsHeaders() });
  if (!res.ok) {
    console.warn(`  customer ${customerId} → HTTP ${res.status}`);
    return null;
  }
  const json = await res.json();
  const a = json?.data?.attributes ?? {};
  return {
    name: a.name ?? null,
    email: a.email ?? null,
    city: a.city ?? null,
    region: a.region ?? null,
    country: a.country ?? null,
    countryFormatted: a.country_formatted ?? null,
  };
}

async function main() {
  if (!process.env.LEMONSQUEEZY_API_KEY) throw new Error('LEMONSQUEEZY_API_KEY missing in .env.local');

  const snap = await db.collection('users').where('licenseStatus', '==', 'active').get();
  console.log(`Active users: ${snap.size}`);

  let updated = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const label = d.email || d.userEmail || doc.id;
    try {
      const customerId = await resolveCustomerId(doc.id, d);
      if (!customerId) {
        console.log(`  skip ${label} — no LS customer id`);
        continue;
      }
      const billing = await fetchBilling(customerId);
      if (!billing) {
        console.log(`  skip ${label} — customer fetch failed`);
        continue;
      }
      const patch: Record<string, unknown> = {
        lsCustomerId: customerId,
        billingName: billing.name,
        billingCity: billing.city,
        billingRegion: billing.region,
        billingCountry: billing.country,
        billingCountryName: billing.countryFormatted,
        updatedAt: new Date(),
      };
      // Fill missing email from LS customer when Firestore has none
      if (!d.email && !d.userEmail && billing.email) {
        patch.email = String(billing.email).trim().toLowerCase();
      }
      await doc.ref.set(patch, { merge: true });
      updated += 1;
      console.log(
        `  ok ${label} → ${[billing.city, billing.region, billing.countryFormatted].filter(Boolean).join(', ') || '(no address)'}`,
      );
    } catch (err) {
      console.warn(`  err ${label}:`, err);
    }
  }
  console.log(`Updated ${updated}/${snap.size}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
