import { NextRequest, NextResponse }   from 'next/server';
import { createJob }                   from '@/lib/motionforge/jobs';
import { validatePanelToken, planHasVFXAccess, calcCreditCost } from '@/lib/motionforge/auth';
import { deductCredits, getUser } from '@/lib/firestore/users';
import { db } from '@/lib/firebaseAdmin';

// ── List user's recent jobs ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await validatePanelToken(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snap = await db
      .collection('users')
      .doc(session.userId)
      .collection('jobs')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const jobs = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id:         doc.id,
        status:     d.status,
        prompt:     d.prompt ?? '',
        mode:       d.mode ?? '',
        effectType: d.effectType ?? '',
        creditCost: d.creditCost ?? 0,
        outputUrl:  d.outputUrl ?? null,
        createdAt:  d.createdAt ?? null,
      };
    });

    return NextResponse.json({ jobs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[jobs/GET] error:', msg);
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // ── Authenticate panel session ────────────────────────────────────────────
  const session = await validatePanelToken(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized, please sign in via the panel.' },
      { status: 401 }
    );
  }

  // ── Live license status check (panel token can outlive subscription) ──────
  const userDoc = await getUser(session.userId).catch(() => null);
  const licenseStatus = userDoc?.licenseStatus ?? 'inactive';
  if (licenseStatus !== 'active') {
    return NextResponse.json(
      {
        error: 'Your subscription is inactive. Please renew your plan to continue generating VFX.',
        code:  'subscription_inactive',
      },
      { status: 403 }
    );
  }

  // ── Plan access check ─────────────────────────────────────────────────────
  const activePlan = userDoc?.plan ?? session.plan;
  if (!planHasVFXAccess(activePlan)) {
    return NextResponse.json(
      { error: 'Your plan does not include VFX access. Please upgrade.' },
      { status: 403 }
    );
  }

  // ── Calculate credit cost from clip duration ──────────────────────────────
  // The panel sends X-Clip-Duration (seconds). If missing, default to 8s max.
  const clipDurHeader = req.headers.get('x-clip-duration');
  const clipDurSec    = clipDurHeader ? Math.max(0.5, parseFloat(clipDurHeader) || 8) : 8;
  const mode          = (req.headers.get('x-mode') ?? 'background').trim();
  const creditCost    = calcCreditCost(clipDurSec, mode);

  // ── Atomically deduct credits ─────────────────────────────────────────────
  let creditsRemaining: number;
  try {
    creditsRemaining = await deductCredits(session.userId, creditCost);
  } catch (err: unknown) {
    const e = err as Error & { code?: string; creditsRemaining?: number; needed?: number };

    if (e.code === 'insufficient_credits') {
      return NextResponse.json(
        {
          error:             `Not enough time left — need ${Math.ceil((e.needed ?? 0) / 4)}s, have ${Math.floor((e.creditsRemaining ?? 0) / 4)}s. Buy more credits to continue.`,
          code:              'insufficient_credits',
          creditsRemaining:  e.creditsRemaining ?? 0,
          needed:            e.needed ?? creditCost,
        },
        { status: 429 }
      );
    }

    console.error('[jobs/POST] deductCredits failed:', err);
    return NextResponse.json({ error: 'Could not process credits' }, { status: 500 });
  }

  // ── Create job ────────────────────────────────────────────────────────────
  try {
    const jobId = await createJob(session.userId, creditCost, {
      email:       (userDoc as any)?.email       ?? undefined,
      displayName: (userDoc as any)?.displayName ?? undefined,
    });
    return NextResponse.json(
      {
        jobId,
        creditCost,
        creditsRemaining,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
