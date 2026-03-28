import { NextRequest, NextResponse }   from 'next/server';
import { createJob }                   from '@/lib/motionforge/jobs';
import { validatePanelToken, planHasVFXAccess, calcCreditCost } from '@/lib/motionforge/auth';
import { deductCredits, createUser }   from '@/lib/firestore/users';

export async function POST(req: NextRequest) {
  // ── Authenticate panel session ────────────────────────────────────────────
  const session = await validatePanelToken(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized — please sign in via the panel.' },
      { status: 401 }
    );
  }

  // ── Plan access check ─────────────────────────────────────────────────────
  if (!planHasVFXAccess(session.plan)) {
    return NextResponse.json(
      { error: 'Your plan does not include VFX access. Please upgrade.' },
      { status: 403 }
    );
  }

  // ── Ensure user doc exists (handles accounts created before credits system) ─
  await createUser(session.userId).catch(() => {});

  // ── Calculate credit cost from clip duration ──────────────────────────────
  // The panel sends X-Clip-Duration (seconds). If missing, default to 8s max.
  const clipDurHeader = req.headers.get('x-clip-duration');
  const clipDurSec    = clipDurHeader ? Math.max(0.5, parseFloat(clipDurHeader) || 8) : 8;
  const creditCost    = calcCreditCost(clipDurSec);

  // ── Atomically deduct credits ─────────────────────────────────────────────
  let creditsRemaining: number;
  try {
    creditsRemaining = await deductCredits(session.userId, creditCost);
  } catch (err: unknown) {
    const e = err as Error & { code?: string; creditsRemaining?: number; needed?: number };

    if (e.code === 'insufficient_credits') {
      return NextResponse.json(
        {
          error:             `Not enough credits — need ${e.needed}, have ${e.creditsRemaining}. Upgrade your plan to continue.`,
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
    const jobId = await createJob(session.userId);
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
