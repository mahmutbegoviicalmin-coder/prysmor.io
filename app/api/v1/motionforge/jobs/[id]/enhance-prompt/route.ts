export const runtime    = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/v1/motionforge/jobs/[id]/enhance-prompt
 *
 * Enhances the user's intent into a Runway-optimised VFX prompt.
 *
 * If the request body includes a base64-encoded frame (`frameBase64`), Claude
 * vision analyses the scene and produces a subject-preserving Runway prompt.
 * Otherwise falls back to compileVfxPrompt (OpenAI gpt-4o-mini).
 *
 * Body: { intent: string, frameBase64?: string }
 * Returns: { prompt, effectType, sceneAnalysis, method }
 */

import { NextRequest, NextResponse }             from 'next/server';
import { getJob, getJobAny }                     from '@/lib/motionforge/jobs';
import { validatePanelKey, validatePanelToken }  from '@/lib/motionforge/auth';
import { enhanceMotionForgePrompt }              from '@/lib/motionforge/promptEnhancer';
import { log, warn }                             from '@/lib/motionforge/logger';

const TAG = 'enhance-prompt';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const session = await validatePanelToken(req);
  if (!session && !validatePanelKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Job lookup ──────────────────────────────────────────────────────────────
  let job;
  try {
    job = session
      ? await getJob(session.userId, params.id)
      : await getJobAny(params.id);
  } catch (err) {
    warn(TAG, 'Job lookup failed', { err: (err as Error).message });
    return NextResponse.json({ error: 'Job lookup failed' }, { status: 500 });
  }
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: { intent?: string; frameBase64?: string; frames?: string[]; mode?: string };
  try { body = await req.json(); }
  catch { body = {}; }

  const userIntent = (body.intent ?? '').trim() || 'make it cinematic and dramatic';
  const mode       = (body.mode ?? 'background').trim();
  const frames: string[] = Array.isArray(body.frames) && body.frames.length > 0
    ? body.frames
    : (body.frameBase64 ?? '').trim() ? [body.frameBase64!.trim()] : [];

  log(TAG, `Enhance-prompt request for job ${params.id}`, {
    userIntent, mode, frameCount: frames.length,
  });

  try {
    const result = await enhanceMotionForgePrompt(userIntent, frames, mode);
    log(TAG, 'Enhance-prompt complete', { method: result.method, mode });
    return NextResponse.json({
      prompt:        result.enhancedPrompt,
      mode,
      sceneAnalysis: null,
      method:        result.method,
    });
  } catch (err) {
    warn(TAG, 'enhanceMotionForgePrompt failed', { err: (err as Error).message });
    return NextResponse.json({
      prompt:        userIntent,
      mode,
      sceneAnalysis: null,
      method:        'fallback',
    });
  }
}
