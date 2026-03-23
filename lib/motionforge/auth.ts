import { NextRequest } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

/**
 * Validates the static panel secret (legacy dev convenience).
 * The CEP panel sends:  X-Panel-Key: <PRYSMOR_PANEL_SECRET>
 */
export function validatePanelKey(req: NextRequest): boolean {
  const secret = process.env.PRYSMOR_PANEL_SECRET;
  if (!secret) return true; // dev fallback
  const provided = req.headers.get('x-panel-key');
  return provided === secret;
}

// ─── Panel session token ───────────────────────────────────────────────────────

export interface PanelSession {
  userId: string;
  plan: string;
  planLabel: string;
  expiresAt: Date;
}

/**
 * Validates Authorization: Bearer <token> and returns the session.
 * Returns null if the token is missing, invalid, or expired.
 */
export async function validatePanelToken(
  req: NextRequest
): Promise<PanelSession | null> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return null;

  try {
    const doc = await db.collection('panel_sessions').doc(token).get();
    if (!doc.exists) return null;

    const data = doc.data()!;
    const expiresAt = data.expiresAt?.toDate?.() ?? new Date(0);
    if (Date.now() > expiresAt.getTime()) return null;

    return {
      userId:    data.userId,
      plan:      data.plan,
      planLabel: data.planLabel,
      expiresAt,
    };
  } catch {
    return null;
  }
}

// ─── Plan limits ───────────────────────────────────────────────────────────────

const PLAN_MONTHLY_RENDERS: Record<string, number> = {
  starter:        25,
  pro:            50,
  exclusive:      100,
  creator:        50,
  'creator-suite': 100,
};

/**
 * Returns how many renders the given plan allows per month.
 */
export function planRenderLimit(plan: string): number {
  return PLAN_MONTHLY_RENDERS[plan] ?? 25;
}

/**
 * Returns true if the plan has access to VFXPilot (all paid plans do).
 */
export function planHasVFXAccess(plan: string): boolean {
  return ['starter', 'pro', 'exclusive', 'creator', 'creator-suite'].includes(plan);
}
