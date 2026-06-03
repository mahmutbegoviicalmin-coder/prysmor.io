import { NextRequest } from 'next/server';
import { db }         from '@/lib/firebaseAdmin';
import { getUser }    from '@/lib/firestore/users';

// ─── Panel session token ───────────────────────────────────────────────────────

export interface PanelSession {
  userId:             string;
  plan:               string;
  planLabel:          string;
  expiresAt:          Date;
  deviceId?:          string;
  machineFingerprint?: string;
}

/**
 * Validates the static panel secret (legacy dev convenience).
 * The CEP panel sends:  X-Panel-Key: <PRYSMOR_PANEL_SECRET>
 */
export function validatePanelKey(req: NextRequest): boolean {
  const secret = process.env.PRYSMOR_PANEL_SECRET;
  if (!secret) return false;
  const provided = req.headers.get('x-panel-key');
  return provided === secret;
}

/**
 * Validates Authorization: Bearer <token> against Firestore panel_sessions.
 * Returns null if the token is missing, invalid, or expired.
 */
export async function validatePanelToken(
  req: NextRequest
): Promise<PanelSession | null> {
  const auth  = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return null;

  try {
    const snap = await db.collection('panel_sessions').doc(token).get();
    if (!snap.exists) return null;

    const data = snap.data()!;
    if (Date.now() > data.expiresAt) return null;

    // Verify license is still active
    const userDoc = await getUser(data.userId).catch(() => null);
    if (userDoc && userDoc.licenseStatus !== 'active') return null;

    return {
      userId:             data.userId,
      plan:               data.plan,
      planLabel:          data.planLabel,
      expiresAt:          new Date(data.expiresAt),
      deviceId:           data.deviceId           ?? undefined,
      machineFingerprint: data.machineFingerprint ?? undefined,
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

export function planRenderLimit(plan: string): number {
  return PLAN_MONTHLY_RENDERS[plan] ?? 25;
}

export function planHasVFXAccess(plan: string): boolean {
  return ['starter', 'pro', 'exclusive', 'creator', 'creator-suite'].includes(plan);
}

/** Default credits per second (background, relight) */
export const CREDITS_PER_SECOND = 4;

/** VFX (Runway Aleph 2) credits per second */
export const CREDITS_PER_SECOND_VFX = 10;

export function creditsPerSecond(mode?: string): number {
  if (mode === 'vfx') return CREDITS_PER_SECOND_VFX;
  return CREDITS_PER_SECOND;
}

export function calcCreditCost(durationSec: number, mode = 'background'): number {
  const rate   = creditsPerSecond(mode);
  const maxDur = mode === 'vfx' ? 30 : 8;
  const dur    = Math.min(Math.max(durationSec, 0.5), maxDur);
  const billableSec = Math.max(Math.ceil(dur), mode === 'vfx' ? 2 : 1);
  return billableSec * rate;
}
