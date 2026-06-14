import { db } from '@/lib/firebaseAdmin';
import {
  DEFAULT_AFFILIATE_CHART,
  type AffiliateChart,
  type AffiliateChartPoint,
} from '@/lib/affiliateChart';

export type { AffiliateChart, AffiliateChartPoint };
export { DEFAULT_AFFILIATE_CHART };

export interface AffiliateProfile {
  id: string;
  email: string;
  userId: string | null;
  code: string;
  commissionPercent: number;    // e.g. 15 = 15%
  // Manual fields set by admin, what the affiliate sees
  manualTotalEarnings: number;
  manualPendingEarnings: number;
  manualPaidEarnings: number;
  manualActiveMembers: number;
  manualInactiveMembers: number;
  manualStarterCount: number;
  manualProCount: number;
  manualExclusiveCount: number;
  manualChart: AffiliateChart;
  note: string;
  status: 'active' | 'inactive';
  createdAt: string | null;
}

export interface AffiliateReferral {
  id: string;
  affiliateCode: string;
  affiliateId: string;
  referredUserId: string;
  referredEmail: string;
  orderId: string;
  plan: string;
  commission: number;
  status: 'pending' | 'paid';
  createdAt: string | null;
}

/** Generate a unique referral code from email */
export function generateCode(email: string): string {
  const base = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8);
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${base}${suffix}`;
}

export function normalizeAffiliateEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Get affiliate profile by Clerk userId */
export async function getAffiliateByUserId(userId: string): Promise<AffiliateProfile | null> {
  const snap = await db.collection('affiliates').where('userId', '==', userId).limit(1).get();
  if (snap.empty) return null;
  return docToAffiliate(snap.docs[0]);
}

/** Get affiliate profile by email (case-insensitive) */
export async function getAffiliateByEmail(email: string): Promise<AffiliateProfile | null> {
  const normalized = normalizeAffiliateEmail(email);
  const snap = await db.collection('affiliates').where('email', '==', normalized).limit(1).get();
  if (!snap.empty) return docToAffiliate(snap.docs[0]);

  // Legacy docs may store mixed-case email
  const all = await db.collection('affiliates').get();
  const match = all.docs.find(
    (doc: FirebaseFirestore.QueryDocumentSnapshot) =>
      normalizeAffiliateEmail(doc.data().email ?? '') === normalized,
  );
  return match ? docToAffiliate(match) : null;
}

/**
 * Resolve affiliate for signed-in user.
 * Links email-only profiles to Clerk userId on first access.
 */
export async function resolveAffiliateForUser(
  userId: string,
  email: string,
): Promise<AffiliateProfile | null> {
  const byUser = await getAffiliateByUserId(userId);
  if (byUser) return byUser;

  const byEmail = await getAffiliateByEmail(email);
  if (!byEmail) return null;

  if (byEmail.userId && byEmail.userId !== userId) {
    return null;
  }

  if (!byEmail.userId) {
    await db.collection('affiliates').doc(byEmail.id).update({
      userId,
      updatedAt: new Date(),
    });
    return { ...byEmail, userId };
  }

  return byEmail;
}

/** Get affiliate profile by referral code */
export async function getAffiliateByCode(code: string): Promise<AffiliateProfile | null> {
  const snap = await db.collection('affiliates').where('code', '==', code).limit(1).get();
  if (snap.empty) return null;
  return docToAffiliate(snap.docs[0]);
}

/** Get all affiliates */
export async function getAllAffiliates(): Promise<AffiliateProfile[]> {
  const snap = await db.collection('affiliates').get();
  const list = snap.docs.map(docToAffiliate);
  return list.sort((a, b) => {
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Get referrals for a specific affiliate */
export async function getReferralsByCode(code: string): Promise<AffiliateReferral[]> {
  // No orderBy here, avoids requiring a composite Firestore index
  const snap = await db.collection('affiliateReferrals')
    .where('affiliateCode', '==', code)
    .get();
  const referrals = snap.docs.map(docToReferral);
  // Sort in memory by createdAt desc
  return referrals.sort((a, b) => {
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Record a new referral when a purchase is made */
export async function recordReferral(params: {
  affiliateCode: string;
  referredUserId: string;
  referredEmail: string;
  orderId: string;
  plan: string;
  commission: number;
}) {
  const affiliate = await getAffiliateByCode(params.affiliateCode);
  if (!affiliate || affiliate.status !== 'active') {
    console.log(`[affiliate] Code "${params.affiliateCode}" not found or inactive, skipping`);
    return;
  }

  // Check if this orderId was already recorded (idempotency)
  const existing = await db.collection('affiliateReferrals')
    .where('orderId', '==', params.orderId).limit(1).get();
  if (!existing.empty) {
    console.log(`[affiliate] Order ${params.orderId} already recorded, skipping`);
    return;
  }

  const referralRef = db.collection('affiliateReferrals').doc();
  await referralRef.set({
    affiliateCode:    params.affiliateCode,
    affiliateId:      affiliate.id,
    referredUserId:   params.referredUserId,
    referredEmail:    params.referredEmail,
    orderId:          params.orderId,
    plan:             params.plan,
    commission:       params.commission,
    status:           'pending',
    createdAt:        new Date(),
  });

  // Note: earnings are managed manually by admin, only log the referral
  await db.collection('affiliates').doc(affiliate.id).update({
    updatedAt: new Date(),
  });

  console.log(`[affiliate] Referral recorded: code=${params.affiliateCode} order=${params.orderId} commission=$${params.commission}`);
}

function normalizeChart(raw: unknown): AffiliateChart {
  if (!raw || typeof raw !== 'object') return DEFAULT_AFFILIATE_CHART;
  const data = raw as { title?: unknown; points?: unknown };
  const title =
    typeof data.title === 'string' && data.title.trim()
      ? data.title.trim()
      : DEFAULT_AFFILIATE_CHART.title;
  const points = Array.isArray(data.points)
    ? data.points
        .map((point) => {
          if (!point || typeof point !== 'object') return null;
          const p = point as { label?: unknown; value?: unknown };
          const label = typeof p.label === 'string' ? p.label.trim() : '';
          const value = Number(p.value);
          if (!label || Number.isNaN(value)) return null;
          return { label, value: Math.max(0, value) };
        })
        .filter((p): p is AffiliateChartPoint => p !== null)
    : [];
  return {
    title,
    points: points.length > 0 ? points : DEFAULT_AFFILIATE_CHART.points,
  };
}

function docToAffiliate(doc: FirebaseFirestore.QueryDocumentSnapshot): AffiliateProfile {
  const d = doc.data();
  let createdAt: string | null = null;
  if (d.createdAt?.toDate) createdAt = d.createdAt.toDate().toISOString();
  else if (d.createdAt instanceof Date) createdAt = d.createdAt.toISOString();
  return {
    id:                    doc.id,
    email:                 d.email ?? '',
    userId:                d.userId ? String(d.userId) : null,
    code:                  d.code ?? '',
    commissionPercent:     d.commissionPercent ?? d.commissionPerSale ?? 15,
    manualTotalEarnings:   d.manualTotalEarnings ?? 0,
    manualPendingEarnings: d.manualPendingEarnings ?? 0,
    manualPaidEarnings:    d.manualPaidEarnings ?? 0,
    manualActiveMembers:   d.manualActiveMembers ?? 0,
    manualInactiveMembers: d.manualInactiveMembers ?? 0,
    manualStarterCount:    d.manualStarterCount ?? 0,
    manualProCount:        d.manualProCount ?? 0,
    manualExclusiveCount:  d.manualExclusiveCount ?? 0,
    manualChart:           normalizeChart(d.manualChart),
    note:                  d.note ?? '',
    status:                d.status ?? 'active',
    createdAt,
  };
}

function docToReferral(doc: FirebaseFirestore.QueryDocumentSnapshot): AffiliateReferral {
  const d = doc.data();
  let createdAt: string | null = null;
  if (d.createdAt?.toDate) createdAt = d.createdAt.toDate().toISOString();
  else if (d.createdAt instanceof Date) createdAt = d.createdAt.toISOString();
  return {
    id:              doc.id,
    affiliateCode:   d.affiliateCode ?? '',
    affiliateId:     d.affiliateId ?? '',
    referredUserId:  d.referredUserId ?? '',
    referredEmail:   d.referredEmail ?? '',
    orderId:         d.orderId ?? '',
    plan:            d.plan ?? '',
    commission:      d.commission ?? 0,
    status:          d.status ?? 'pending',
    createdAt,
  };
}
