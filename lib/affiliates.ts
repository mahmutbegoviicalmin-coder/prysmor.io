import { db } from '@/lib/firebaseAdmin';

export interface AffiliateProfile {
  id: string;
  email: string;
  userId: string;
  code: string;
  commissionPercent: number;    // e.g. 15 = 15%
  // Manual fields set by admin — what the affiliate sees
  manualTotalEarnings: number;
  manualPendingEarnings: number;
  manualPaidEarnings: number;
  manualActiveMembers: number;
  manualInactiveMembers: number;
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

/** Get affiliate profile by Clerk userId */
export async function getAffiliateByUserId(userId: string): Promise<AffiliateProfile | null> {
  const snap = await db.collection('affiliates').where('userId', '==', userId).limit(1).get();
  if (snap.empty) return null;
  return docToAffiliate(snap.docs[0]);
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
  // No orderBy here — avoids requiring a composite Firestore index
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

  // Note: earnings are managed manually by admin — only log the referral
  await db.collection('affiliates').doc(affiliate.id).update({
    updatedAt: new Date(),
  });

  console.log(`[affiliate] Referral recorded: code=${params.affiliateCode} order=${params.orderId} commission=$${params.commission}`);
}

function docToAffiliate(doc: FirebaseFirestore.QueryDocumentSnapshot): AffiliateProfile {
  const d = doc.data();
  let createdAt: string | null = null;
  if (d.createdAt?.toDate) createdAt = d.createdAt.toDate().toISOString();
  else if (d.createdAt instanceof Date) createdAt = d.createdAt.toISOString();
  return {
    id:                    doc.id,
    email:                 d.email ?? '',
    userId:                d.userId ?? '',
    code:                  d.code ?? '',
    commissionPercent:     d.commissionPercent ?? d.commissionPerSale ?? 15,
    manualTotalEarnings:   d.manualTotalEarnings ?? 0,
    manualPendingEarnings: d.manualPendingEarnings ?? 0,
    manualPaidEarnings:    d.manualPaidEarnings ?? 0,
    manualActiveMembers:   d.manualActiveMembers ?? 0,
    manualInactiveMembers: d.manualInactiveMembers ?? 0,
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
