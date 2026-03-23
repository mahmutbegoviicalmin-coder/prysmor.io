import { NextRequest, NextResponse } from 'next/server';
import { createJob } from '@/lib/motionforge/jobs';
import { validatePanelToken, planHasVFXAccess, planRenderLimit } from '@/lib/motionforge/auth';
import { db } from '@/lib/firebaseAdmin';

function cycleStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

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

  // ── Monthly usage check ───────────────────────────────────────────────────
  // Query only by userId (no composite index needed), then filter in memory.
  const limit = planRenderLimit(session.plan);
  let usedThisCycle = 0;
  try {
    const snap = await db
      .collection('motionforge_jobs')
      .where('userId', '==', session.userId)
      .limit(500)
      .get();

    const cycleMs = cycleStart().getTime();
    usedThisCycle = snap.docs.filter((d) => {
      const createdAt = d.data().createdAt;
      const ms = createdAt?.toDate
        ? createdAt.toDate().getTime()
        : new Date(createdAt ?? 0).getTime();
      return ms >= cycleMs;
    }).length;
  } catch (err) {
    // If usage check fails, log but don't block the user
    console.error('[jobs/POST] usage check failed:', err);
  }

  if (usedThisCycle >= limit) {
    return NextResponse.json(
      {
        error: `Monthly render limit reached (${usedThisCycle}/${limit}). Resets next cycle.`,
        usedThisCycle,
        limit,
      },
      { status: 429 }
    );
  }

  // ── Create job ────────────────────────────────────────────────────────────
  try {
    const jobId = await createJob(session.userId);
    return NextResponse.json(
      { jobId, usedThisCycle: usedThisCycle + 1, limit },
      { status: 201 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
