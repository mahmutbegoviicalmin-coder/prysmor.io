import { db } from '@/lib/firebaseAdmin';
import { fetchLsCustomerBilling } from '@/lib/lemonsqueezy';

/** Persist Lemon Squeezy customer billing location onto the user doc. */
export async function syncUserBillingFromLs(
  userId: string,
  customerId?: string | null,
): Promise<void> {
  if (!userId || !customerId) return;
  const billing = await fetchLsCustomerBilling(customerId);
  if (!billing) {
    await db.collection('users').doc(userId).set({
      lsCustomerId: String(customerId),
      updatedAt: new Date(),
    }, { merge: true });
    return;
  }
  await db.collection('users').doc(userId).set({
    lsCustomerId: String(customerId),
    billingName: billing.name,
    billingCity: billing.city,
    billingRegion: billing.region,
    billingCountry: billing.country,
    billingCountryName: billing.countryFormatted,
    updatedAt: new Date(),
  }, { merge: true });
}

export function formatBillingAddress(d: {
  billingCity?: string | null;
  billingRegion?: string | null;
  billingCountryName?: string | null;
  billingCountry?: string | null;
}): string | null {
  const parts = [d.billingCity, d.billingRegion, d.billingCountryName || d.billingCountry]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}
