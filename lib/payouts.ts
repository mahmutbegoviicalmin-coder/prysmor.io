import { db } from '@/lib/firebaseAdmin';

export type PayoutMethod = 'paypal' | 'bank';
export type PayoutStatus = 'pending' | 'paid' | 'rejected';

export interface PayoutBankDetails {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  phone: string;
  accountNumber: string;
}

export interface PayoutRequest {
  id: string;
  affiliateId: string;
  userId: string;
  email: string;
  amount: number;
  method: PayoutMethod;
  paypalMeLink?: string;
  bank?: PayoutBankDetails;
  status: PayoutStatus;
  adminNote?: string;
  createdAt: string | null;
  updatedAt: string | null;
  paidAt: string | null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export function docToPayoutRequest(
  doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot,
): PayoutRequest {
  const d = doc.data()!;
  return {
    id: doc.id,
    affiliateId: d.affiliateId ?? '',
    userId: d.userId ?? '',
    email: d.email ?? '',
    amount: Number(d.amount ?? 0),
    method: d.method === 'bank' ? 'bank' : 'paypal',
    paypalMeLink: d.paypalMeLink ?? undefined,
    bank: d.bank ?? undefined,
    status: d.status === 'paid' || d.status === 'rejected' ? d.status : 'pending',
    adminNote: d.adminNote ?? undefined,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    paidAt: toIso(d.paidAt),
  };
}

export async function getPayoutRequestsForUser(userId: string): Promise<PayoutRequest[]> {
  const snap = await db.collection('payoutRequests').where('userId', '==', userId).get();
  return snap.docs
    .map(docToPayoutRequest)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

export async function getOpenPayoutRequestForUser(userId: string): Promise<PayoutRequest | null> {
  const snap = await db
    .collection('payoutRequests')
    .where('userId', '==', userId)
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return docToPayoutRequest(snap.docs[0]);
}

export async function getAllPayoutRequests(): Promise<PayoutRequest[]> {
  const snap = await db.collection('payoutRequests').get();
  return snap.docs
    .map(docToPayoutRequest)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}
