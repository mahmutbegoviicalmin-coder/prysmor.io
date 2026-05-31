import { db } from '@/lib/firebaseAdmin';
import type { FunnelId } from './constants';
import { getFunnel, renderStepHtml } from './funnels';
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

export async function loadUserEmailProfile(userId: string): Promise<UserEmailProfile | null> {
  const snap = await db.collection('users').doc(userId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  const email = (d.email as string | undefined)?.trim();
  if (!email) return null;

  return {
    userId,
    email,
    firstName: (d.firstName as string | undefined)?.trim()
      || (d.displayName as string | undefined)?.split(' ')[0]
      || 'there',
    plan:             (d.plan as string) ?? 'unpaid',
    licenseStatus:    (d.licenseStatus as string) ?? 'inactive',
    marketingOptIn:   d.marketingOptIn !== false,
    marketingUnsubscribedAt: d.marketingUnsubscribedAt ?? null,
  };
}

export function isEligibleForFunnel(profile: UserEmailProfile, funnelId: FunnelId): boolean {
  if (!profile.marketingOptIn || profile.marketingUnsubscribedAt) return false;

  if (funnelId === 'unpaid-starter') {
    return profile.licenseStatus !== 'active';
  }
  if (funnelId === 'starter-pro') {
    return profile.licenseStatus === 'active' && profile.plan === 'starter';
  }
  return false;
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

  const funnel = getFunnel(funnelId);
  const enrolledAt = new Date();
  const nextSendAt = computeNextSendAt(enrolledAt, funnel.steps[0]?.delayDays ?? 0);

  await ref.set({
    userId,
    funnelId,
    status:       'active',
    currentStep:  0,
    enrolledAt,
    nextSendAt,
    email:        profile.email,
    updatedAt:    new Date(),
  });
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

async function logEmail(data: Record<string, unknown>): Promise<void> {
  await db.collection('email_logs').add({
    ...data,
    createdAt: new Date(),
  });
}

export interface ProcessQueueResult {
  processed: number;
  sent: number;
  skipped: number;
  errors: string[];
  dailyCapHit: boolean;
}

export async function processEmailQueue(maxBatch = 30): Promise<ProcessQueueResult> {
  const settings = await getEmailSettings();
  const dailySent = await getDailyMarketingSentCount();
  const result: ProcessQueueResult = {
    processed: 0,
    sent:      0,
    skipped:   0,
    errors:    [],
    dailyCapHit: dailySent >= settings.dailyMarketingCap,
  };

  if (result.dailyCapHit) return result;

  const now = new Date();
  const snap = await db.collection('email_enrollments')
    .where('status', '==', 'active')
    .where('nextSendAt', '<=', now)
    .orderBy('nextSendAt', 'asc')
    .limit(maxBatch)
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

    const profile = await loadUserEmailProfile(userId);
    if (!profile || !isEligibleForFunnel(profile, funnelId)) {
      await doc.ref.update({
        status:       'cancelled',
        cancelReason: 'ineligible',
        updatedAt:    new Date(),
      });
      result.skipped++;
      continue;
    }

    const funnel = getFunnel(funnelId);
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

/** Stats for admin dashboard */
export async function getEmailAdminStats() {
  const [activeSnap, logsSnap, unpaidSnap] = await Promise.all([
    db.collection('email_enrollments').where('status', '==', 'active').count().get(),
    db.collection('email_logs').orderBy('createdAt', 'desc').limit(50).get(),
    db.collection('users').where('licenseStatus', '==', 'inactive').count().get(),
  ]);

  const settings = await getEmailSettings();
  const dailySent = await getDailyMarketingSentCount();

  const logs = logsSnap.docs.map((d) => {
    const x = d.data();
    return {
      id:        d.id,
      userId:    x.userId as string,
      email:     x.email as string,
      funnelId:  x.funnelId as string,
      step:      x.step as number,
      status:    x.status as string,
      subject:   x.subject as string,
      error:     x.error as string | undefined,
      createdAt: x.createdAt?.toDate?.()?.toISOString?.() ?? null,
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

  return {
    settings,
    dailySent,
    activeEnrollments: activeSnap.data().count,
    unpaidUsers:       unpaidSnap.data().count,
    enrollmentCounts,
    logs,
  };
}
