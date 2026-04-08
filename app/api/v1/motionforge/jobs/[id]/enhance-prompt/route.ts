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
import { enhancePromptWithClaude }               from '@/lib/motionforge/claudeSceneAnalyzer';
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
  let body: { intent?: string; frameBase64?: string };
  try { body = await req.json(); }
  catch { body = {}; }

  const userIntent  = (body.intent ?? '').trim() || 'make it cinematic and dramatic';
  const frameBase64 = (body.frameBase64 ?? '').trim();
  log(TAG, `Enhance-prompt request for job ${params.id}`, {
    userIntent,
    hasFrame: !!frameBase64,
  });

  // ── Claude vision path (frame provided) ─────────────────────────────────────
  if (frameBase64) {
    try {
      const result = await enhancePromptWithClaude(frameBase64, userIntent);
      log(TAG, 'Claude enhance-prompt complete', { effectType: result.effectType });
      return NextResponse.json({
        prompt:        result.compiledPrompt,
        effectType:    result.effectType,
        sceneAnalysis: null,
        method:        'claude-vision',
      });
    } catch (err) {
      warn(TAG, 'Claude vision failed — falling back to compileVfxPrompt', {
        err: (err as Error).message,
      });
    }
  }

  // ── Text-only fallback: compileVfxPrompt (Claude Haiku) ─────────────────────
  try {
    const { compileVfxPrompt } = await import('@/lib/motionforge/promptCompiler');
    const result = await compileVfxPrompt(userIntent).catch(() => ({
      compiledPrompt: userIntent,
      effectType: 'background' as const,
      method: 'fallback' as const,
    }));
    log(TAG, 'Enhance-prompt complete', { method: result.method });
    return NextResponse.json({
      prompt:        result.compiledPrompt,
      effectType:    result.effectType,
      sceneAnalysis: null,
      method:        result.method,
    });
  } catch (err) {
    warn(TAG, 'compileVfxPrompt failed', { err: (err as Error).message });
    return NextResponse.json({
      prompt:        userIntent,
      effectType:    'background',
      sceneAnalysis: null,
      method:        'fallback',
    });
  }
}
