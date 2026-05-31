import { createClerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/firebaseAdmin';
import type { FunnelId } from './constants';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
import { getMergedFunnel } from './campaigns';
import { renderStepHtml } from './funnels';
import { getEmailSettings, incrementDailyMarketingSent, getDailyMarketingSentCount } from './settings';
import { sendMarketingEmail } from './send';
import { buildUnsubscribeUrl } from './unsubscribe';

export type EnrollmentStatus = 'active' | 'completed' | 'cancelled';

export interface UserEmailProfile {
  userId: string;
  email: string;
  firstName: string;
  plan: string;
  licenseStatus: string;
  marketingOptIn: boolean;
  marketingUnsubscribedAt?: Date | null;
}

function enrollmentDocId(userId: string, funnelId: FunnelId): string {
  return `${userId}_${funnelId}`;
}

function computeNextSendAt(enrolledAt: Date, delayDays: number): Date {
  return new Date(enrolledAt.getTime() + delayDays * 24 * 60 * 60 * 1000);
}

export async function loadUserEmailProfile(
  userId: string,
  fallbackEmail?: string,
): Promise<UserEmailProfile | null> {
  const [snap, clerkUser] = await Promise.all([
    db.collection('users').doc(userId).get(),
    clerk.users.getUser(userId).catch(() => null),
  ]);

  const d = snap.exists ? snap.data()! : {};
  const clerkEmail = clerkUser?.emailAddresses?.[0]?.emailAddress ?? '';
  const email = (
    clerkEmail
    || (d.email as string | undefined)
    || (d.userEmail as string | undefined)
    || fallbackEmail
  )?.trim();
  if (!email) return null;

  return {
    userId,
    email,
    firstName: (clerkUser?.firstName as string | undefined)?.trim()
      || (d.firstName as string | undefined)?.trim()
      || (d.displayName as string | undefined)?.split(' ')[0]
      || 'there',
    plan:             (d.plan as string) ?? 'unpaid',
    licenseStatus:    effectiveLicenseStatus(d.licenseStatus as string | undefined),
    marketingOptIn:   d.marketingOptIn !== false,
    marketingUnsubscribedAt: d.marketingUnsubscribedAt ?? null,
  };
}

/** Matches Users tab: missing licenseStatus counts as inactive. */
export function effectiveLicenseStatus(raw: string | undefined): string {
  return raw ?? 'inactive';
}

export function isUnpaidUser(rawLicenseStatus: string | undefined): boolean {
  return effectiveLicenseStatus(rawLicenseStatus) !== 'active';
}

export function isEligibleForFunnel(profile: UserEmailProfile, funnelId: FunnelId): boolean {
  if (!profile.marketingOptIn || profile.marketingUnsubscribedAt) return false;

  if (funnelId === 'unpaid-starter') {
    return isUnpaidUser(profile.licenseStatus);
  }
  if (funnelId === 'starter-pro') {
    return profile.licenseStatus === 'active' && profile.plan === 'starter';
  }
  return false;
}

function profileFromUserDoc(userId: string, d: FirebaseFirestore.DocumentData): UserEmailProfile | null {
  const email = ((d.email as string | undefined) ?? (d.userEmail as string | undefined))?.trim();
  if (!email) return null;
  return {
    userId,
    email,
    firstName: (d.firstName as string | undefined)?.trim()
      || (d.displayName as string | undefined)?.split(' ')[0]
      || 'there',
    plan:             (d.plan as string) ?? 'unpaid',
    licenseStatus:    effectiveLicenseStatus(d.licenseStatus as string | undefined),
    marketingOptIn:   d.marketingOptIn !== false,
    marketingUnsubscribedAt: d.marketingUnsubscribedAt ?? null,
  };
}

/** Enroll user in a funnel (idempotent — won't reset active enrollment). */
export async function enrollInFunnel(userId: string, funnelId: FunnelId): Promise<void> {
  const settings = await getEmailSettings();
  if (!settings.funnels[funnelId]?.enabled) return;

  const profile = await loadUserEmailProfile(userId);
  if (!profile || !isEligibleForFunnel(profile, funnelId)) return;

  const ref = db.collection('email_enrollments').doc(enrollmentDocId(userId, funnelId));
  const existing = await ref.get();
  if (existing.exists && existing.data()?.status === 'active') return;
  if (existing.exists && existing.data()?.status === 'completed') return;

  const funnel = await getMergedFunnel(funnelId);
  const enrolledAt = new Date();
  const nextSendAt = computeNextSendAt(enrolledAt, funnel.steps[0]?.delayDays ?? 0);

  await writeEnrollment(ref, userId, funnelId, profile.email, enrolledAt, nextSendAt);
}

async function writeEnrollment(
  ref: FirebaseFirestore.DocumentReference,
  userId: string,
  funnelId: FunnelId,
  email: string,
  enrolledAt: Date,
  nextSendAt: Date,
): Promise<void> {
  await ref.set({
    userId,
    funnelId,
    status:       'active',
    currentStep:  0,
    enrolledAt,
    nextSendAt,
    email,
    updatedAt:    new Date(),
  });
}

export interface EnrollAllUnpaidResult {
  enrolled: number;
  skipped:  number;
  total:    number;
  errors:   string[];
}

interface UnpaidCandidate {
  userId: string;
  email: string;
  createdAt: number;
}

/** Same source as Admin Users tab: Clerk list + Firestore profile. */
async function listUnpaidCandidates(funnelId: FunnelId): Promise<UnpaidCandidate[]> {
  const [snap, clerkRes] = await Promise.all([
    db.collection('users').limit(1000).get(),
    clerk.users.getUserList({ limit: 500 }).catch(() => ({ data: [] as { id: string; emailAddresses?: { emailAddress: string }[]; firstName?: string | null; createdAt?: number }[] })),
  ]);

  const fsMap = new Map<string, FirebaseFirestore.DocumentData>();
  for (const doc of snap.docs) fsMap.set(doc.id, doc.data());

  const candidates: UnpaidCandidate[] = [];

  for (const cu of clerkRes.data) {
    const d = fsMap.get(cu.id) ?? {};
    if (!isUnpaidUser(d.licenseStatus as string | undefined)) continue;

    const clerkEmail = cu.emailAddresses?.[0]?.emailAddress ?? '';
    const merged = {
      ...d,
      email: clerkEmail || d.email,
      userEmail: d.userEmail,
      firstName: cu.firstName ?? d.firstName,
    };

    const profile = profileFromUserDoc(cu.id, merged);
    if (!profile || !isEligibleForFunnel(profile, funnelId)) continue;

    let createdAt = 0;
    if (d.createdAt?.toDate) createdAt = d.createdAt.toDate().getTime();
    else if (d.createdAt instanceof Date) createdAt = d.createdAt.getTime();
    else if (cu.createdAt) createdAt = new Date(cu.createdAt).getTime();

    candidates.push({ userId: cu.id, email: profile.email, createdAt });
  }

  candidates.sort((a, b) => a.createdAt - b.createdAt);
  return candidates;
}

/**
 * Enroll all unpaid users into a funnel, oldest signups first.
 * Staggers first-send day by daily cap so the queue respects Resend limits.
 */
export async function enrollAllUnpaidInFunnel(funnelId: FunnelId): Promise<EnrollAllUnpaidResult> {
  const settings = await getEmailSettings();
  if (!settings.funnels[funnelId]?.enabled) {
    throw new Error(`Funnel "${funnelId}" is disabled`);
  }
  if (funnelId !== 'unpaid-starter') {
    throw new Error('Bulk enroll is only supported for unpaid-starter');
  }

  const cap = settings.dailyMarketingCap;
  const funnel = await getMergedFunnel(funnelId);
  const step0Delay = funnel.steps[0]?.delayDays ?? 0;

  const candidates = await listUnpaidCandidates(funnelId);

  const now = new Date();
  const result: EnrollAllUnpaidResult = {
    enrolled: 0,
    skipped:  0,
    total:    candidates.length,
    errors:   [],
  };

  for (let i = 0; i < candidates.length; i++) {
    const { userId, email } = candidates[i];
    const ref = db.collection('email_enrollments').doc(enrollmentDocId(userId, funnelId));

    try {
      const existing = await ref.get();
      const status = existing.data()?.status as string | undefined;
      if (existing.exists && (status === 'active' || status === 'completed')) {
        result.skipped++;
        continue;
      }

      const dayOffset = Math.floor(i / cap);
      const enrolledAt = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const nextSendAt = computeNextSendAt(enrolledAt, step0Delay);

      await writeEnrollment(ref, userId, funnelId, email, enrolledAt, nextSendAt);
      result.enrolled++;
    } catch (e) {
      result.errors.push(`${userId}: ${e instanceof Error ? e.message : 'enroll failed'}`);
    }
  }

  return result;
}

/** Stop funnel — e.g. user subscribed or unsubscribed. */
export async function completeFunnel(
  userId: string,
  funnelId: FunnelId,
  reason: string,
): Promise<void> {
  const ref = db.collection('email_enrollments').doc(enrollmentDocId(userId, funnelId));
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.update({
    status:        'completed',
    cancelReason:  reason,
    completedAt:   new Date(),
    updatedAt:     new Date(),
  });
}

export async function cancelAllFunnelsForUser(userId: string, reason: string): Promise<void> {
  const snap = await db.collection('email_enrollments')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .get();

  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.update(doc.ref, {
      status:       'cancelled',
      cancelReason: reason,
      updatedAt:    new Date(),
    });
  }
  await batch.commit();
}

export async function onUserBecamePaid(userId: string, plan: string): Promise<void> {
  await completeFunnel(userId, 'unpaid-starter', 'converted');
  if (plan === 'starter') {
    await enrollInFunnel(userId, 'starter-pro');
  } else {
    await completeFunnel(userId, 'starter-pro', 'upgraded');
  }
}

async function logEmail(data: Record<string, unknown>): Promise<string> {
  const ref = await db.collection('email_logs').add({
    ...data,
    openCount:  0,
    clickCount: 0,
    createdAt:  new Date(),
  });
  return ref.id;
}

/** Update log when Resend reports delivery / open / click */
export async function trackResendEmailEvent(
  resendId: string,
  event: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained',
): Promise<boolean> {
  const snap = await db.collection('email_logs')
    .where('resendId', '==', resendId)
    .limit(1)
    .get();

  if (snap.empty) return false;

  const ref = snap.docs[0].ref;
  const now = new Date();
  const patch: Record<string, unknown> = { updatedAt: now };

  if (event === 'delivered') patch.deliveredAt = now;
  if (event === 'opened') {
    patch.openedAt = snap.docs[0].data().openedAt ?? now;
    patch.openCount = ((snap.docs[0].data().openCount as number) ?? 0) + 1;
  }
  if (event === 'clicked') {
    patch.clickedAt = snap.docs[0].data().clickedAt ?? now;
    patch.clickCount = ((snap.docs[0].data().clickCount as number) ?? 0) + 1;
  }
  if (event === 'bounced' || event === 'complained') patch.status = event;

  await ref.update(patch);
  return true;
}

export interface ProcessQueueResult {
  processed: number;
  sent: number;
  skipped: number;
  errors: string[];
  dailyCapHit: boolean;
}

export async function processEmailQueue(requestedBatch?: number): Promise<ProcessQueueResult> {
  const settings = await getEmailSettings();
  const dailySent = await getDailyMarketingSentCount();
  const remaining = Math.max(0, settings.dailyMarketingCap - dailySent);
  const result: ProcessQueueResult = {
    processed: 0,
    sent:      0,
    skipped:   0,
    errors:    [],
    dailyCapHit: remaining === 0,
  };

  if (result.dailyCapHit) return result;

  const batchLimit = Math.min(requestedBatch ?? remaining, remaining);

  const now = new Date();
  const snap = await db.collection('email_enrollments')
    .where('status', '==', 'active')
    .where('nextSendAt', '<=', now)
    .orderBy('nextSendAt', 'asc')
    .limit(batchLimit)
    .get();

  for (const doc of snap.docs) {
    if (await getDailyMarketingSentCount() >= settings.dailyMarketingCap) {
      result.dailyCapHit = true;
      break;
    }

    result.processed++;
    const data = doc.data();
    const userId = data.userId as string;
    const funnelId = data.funnelId as FunnelId;
    const currentStep = (data.currentStep as number) ?? 0;

    if (!settings.funnels[funnelId]?.enabled) {
      result.skipped++;
      continue;
    }

    const enrollmentEmail = (data.email as string | undefined)?.trim();
    const profile = await loadUserEmailProfile(userId, enrollmentEmail);
    if (!profile || !isEligibleForFunnel(profile, funnelId)) {
      await doc.ref.update({
        status:       'cancelled',
        cancelReason: profile ? 'ineligible' : 'no_email',
        updatedAt:    new Date(),
      });
      result.skipped++;
      continue;
    }

    const funnel = await getMergedFunnel(funnelId);
    const step = funnel.steps[currentStep];
    if (!step) {
      await doc.ref.update({ status: 'completed', completedAt: new Date(), updatedAt: new Date() });
      result.skipped++;
      continue;
    }

    const { subject, html } = renderStepHtml(step, {
      firstName:      profile.firstName,
      unsubscribeUrl: buildUnsubscribeUrl(userId),
    });

    const sendResult = await sendMarketingEmail({
      to:       profile.email,
      subject,
      innerHtml: html,
      userId,
    });

    if (!sendResult.ok) {
      result.errors.push(`${userId}/${funnelId} step ${currentStep}: ${sendResult.error}`);
      await logEmail({
        userId, funnelId, step: currentStep, status: 'failed',
        error: sendResult.error, email: profile.email, subject,
      });
      continue;
    }

    await incrementDailyMarketingSent();
    result.sent++;

    const nextStep = currentStep + 1;
    const enrolledRaw = data.enrolledAt;
    const enrolledAt =
      enrolledRaw && typeof (enrolledRaw as { toDate?: () => Date }).toDate === 'function'
        ? (enrolledRaw as { toDate: () => Date }).toDate()
        : new Date(enrolledRaw as string | number);

    if (nextStep >= funnel.steps.length) {
      await doc.ref.update({
        status:      'completed',
        completedAt: new Date(),
        updatedAt:   new Date(),
      });
    } else {
      const nextDelay = funnel.steps[nextStep].delayDays;
      await doc.ref.update({
        currentStep: nextStep,
        nextSendAt:  computeNextSendAt(enrolledAt, nextDelay),
        updatedAt:   new Date(),
      });
    }

    await logEmail({
      userId,
      funnelId,
      step:     currentStep,
      status:   'sent',
      resendId: sendResult.resendId,
      email:    profile.email,
      subject,
    });
  }

  return result;
}

/** Enroll all active Starter users into starter-pro upsell */
export async function enrollAllStarterPro(): Promise<EnrollAllUnpaidResult> {
  const funnelId = 'starter-pro' as const;
  const settings = await getEmailSettings();
  if (!settings.funnels[funnelId]?.enabled) {
    throw new Error('Funnel "starter-pro" is disabled');
  }

  const cap = settings.dailyMarketingCap;
  const funnel = await getMergedFunnel(funnelId);
  const step0Delay = funnel.steps[0]?.delayDays ?? 0;

  const [snap, clerkRes] = await Promise.all([
    db.collection('users').limit(1000).get(),
    clerk.users.getUserList({ limit: 500 }).catch(() => ({ data: [] as { id: string; emailAddresses?: { emailAddress: string }[]; firstName?: string | null; createdAt?: number }[] })),
  ]);
  const fsMap = new Map<string, FirebaseFirestore.DocumentData>();
  for (const doc of snap.docs) fsMap.set(doc.id, doc.data());

  const candidates: UnpaidCandidate[] = [];
  for (const cu of clerkRes.data) {
    const d = fsMap.get(cu.id) ?? {};
    const merged = {
      ...d,
      email: cu.emailAddresses?.[0]?.emailAddress || d.email,
      firstName: cu.firstName ?? d.firstName,
    };
    const profile = profileFromUserDoc(cu.id, merged);
    if (!profile || !isEligibleForFunnel(profile, funnelId)) continue;
    let createdAt = 0;
    if (d.createdAt?.toDate) createdAt = d.createdAt.toDate().getTime();
    else if (cu.createdAt) createdAt = new Date(cu.createdAt).getTime();
    candidates.push({ userId: cu.id, email: profile.email, createdAt });
  }
  candidates.sort((a, b) => a.createdAt - b.createdAt);

  const now = new Date();
  const result: EnrollAllUnpaidResult = { enrolled: 0, skipped: 0, total: candidates.length, errors: [] };

  for (let i = 0; i < candidates.length; i++) {
    const { userId, email } = candidates[i];
    const ref = db.collection('email_enrollments').doc(enrollmentDocId(userId, funnelId));
    try {
      const existing = await ref.get();
      const status = existing.data()?.status as string | undefined;
      if (existing.exists && (status === 'active' || status === 'completed')) {
        result.skipped++;
        continue;
      }
      const dayOffset = Math.floor(i / cap);
      const enrolledAt = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const nextSendAt = computeNextSendAt(enrolledAt, step0Delay);
      await writeEnrollment(ref, userId, funnelId, email, enrolledAt, nextSendAt);
      result.enrolled++;
    } catch (e) {
      result.errors.push(`${userId}: ${e instanceof Error ? e.message : 'enroll failed'}`);
    }
  }
  return result;
}

async function computeUnpaidBreakdown() {
  const [snap, clerkRes] = await Promise.all([
    db.collection('users').limit(1000).get(),
    clerk.users.getUserList({ limit: 500 }).catch(() => ({ data: [] as { id: string }[] })),
  ]);
  const fsMap = new Map<string, FirebaseFirestore.DocumentData>();
  for (const doc of snap.docs) fsMap.set(doc.id, doc.data());

  let unpaidTotal = 0;
  for (const cu of clerkRes.data) {
    const d = fsMap.get(cu.id) ?? {};
    if (isUnpaidUser(d.licenseStatus as string | undefined)) unpaidTotal++;
  }

  const eligibleList = await listUnpaidCandidates('unpaid-starter');
  return { unpaidTotal, unpaidEligible: eligibleList.length };
}

async function countStarterEligible(): Promise<number> {
  const list = await listUnpaidCandidates('starter-pro');
  return list.length;
}

/** Stats for admin dashboard */
export async function getEmailAdminStats() {
  const { getAllCampaigns } = await import('./campaigns');

  const [activeSnap, logsSnap, unpaidBreakdown, campaigns, starterEligible] = await Promise.all([
    db.collection('email_enrollments').where('status', '==', 'active').count().get(),
    db.collection('email_logs').orderBy('createdAt', 'desc').limit(200).get(),
    computeUnpaidBreakdown(),
    getAllCampaigns(),
    countStarterEligible(),
  ]);

  const settings = await getEmailSettings();
  const dailySent = await getDailyMarketingSentCount();

  let analyticsSent = 0;
  let analyticsOpened = 0;
  let analyticsClicked = 0;

  const logs = logsSnap.docs.map((d) => {
    const x = d.data();
    if (x.status === 'sent') {
      analyticsSent++;
      if (x.openedAt) analyticsOpened++;
      if (x.clickedAt) analyticsClicked++;
    }
    return {
      id:         d.id,
      userId:     x.userId as string,
      email:      x.email as string,
      funnelId:   x.funnelId as string,
      step:       x.step as number,
      status:     x.status as string,
      subject:    x.subject as string,
      error:      x.error as string | undefined,
      resendId:   x.resendId as string | undefined,
      openedAt:   x.openedAt?.toDate?.()?.toISOString?.() ?? null,
      clickedAt:  x.clickedAt?.toDate?.()?.toISOString?.() ?? null,
      deliveredAt: x.deliveredAt?.toDate?.()?.toISOString?.() ?? null,
      openCount:  (x.openCount as number) ?? 0,
      createdAt:  x.createdAt?.toDate?.()?.toISOString?.() ?? null,
    };
  });

  const enrollmentCounts: Record<string, number> = {};
  for (const fid of ['unpaid-starter', 'starter-pro'] as const) {
    const c = await db.collection('email_enrollments')
      .where('funnelId', '==', fid)
      .where('status', '==', 'active')
      .count()
      .get();
    enrollmentCounts[fid] = c.data().count;
  }

  const unpaidInCampaign = enrollmentCounts['unpaid-starter'] ?? 0;

  const openRate = analyticsSent > 0
    ? Math.round((analyticsOpened / analyticsSent) * 100)
    : 0;

  return {
    settings,
    dailySent,
    activeEnrollments: activeSnap.data().count,
    unpaidUsers:       unpaidBreakdown.unpaidTotal,
    unpaidEligible:    unpaidBreakdown.unpaidEligible,
    unpaidInCampaign,
    unpaidPending:     Math.max(0, unpaidBreakdown.unpaidEligible - unpaidInCampaign),
    starterEligible,
    starterInCampaign: enrollmentCounts['starter-pro'] ?? 0,
    enrollmentCounts,
    campaigns,
    analytics: {
      sent:     analyticsSent,
      opened:   analyticsOpened,
      clicked:  analyticsClicked,
      openRate,
    },
    logs: logs.slice(0, 50),
  };
}
