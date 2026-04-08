/**
 * POST /api/v1/motionforge/enhance-prompt
 *
 * Transforms a short user prompt into an identity-safe cinematic prompt
 * optimised for Runway video-to-video generation.
 *
 * Request body:
 *   { prompt: string, frames?: string[] }   — frames = base64 JPEG scene frames
 *
 * Response:
 *   { enhancedPrompt: string, enhanced: string, method: string, sceneAnalysed: boolean }
 *
 * Notes:
 *   - `enhancedPrompt` is the canonical field per the current API spec.
 *   - `enhanced` is kept for backward compatibility with panel main.js.
 *   - Primary path uses OpenAI dynamically (no hardcoded template database).
 *   - Falls back to rule-based enhancement when OpenAI is unavailable.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { validatePanelKey, validatePanelToken } from '@/lib/motionforge/auth';
import { log, warn, error as logError } from '@/lib/motionforge/logger';
import {
  enhanceMotionForgePrompt,
  validatePrompt,
}                                    from '@/lib/motionforge/promptEnhancer';

const TAG = 'enhance-prompt';

export async function POST(req: NextRequest) {
  // Accept either a session Bearer token (panel after login) or a pre-shared panel key
  const session = await validatePanelToken(req);
  if (!session && !validatePanelKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: { prompt?: string; frames?: unknown; frameBase64?: string };
  try {
    body = await req.json() as { prompt?: string; frames?: unknown; frameBase64?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // ── Validate prompt ─────────────────────────────────────────────────────────
  let cleanPrompt: string;
  try {
    cleanPrompt = validatePrompt(body.prompt ?? '');
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'prompt is required' },
      { status: 400 },
    );
  }

  // ── Validate frames (optional) ──────────────────────────────────────────────
  // Accepts both frames[] array and single frameBase64 string for compatibility.
  const singleFrame = typeof body.frameBase64 === 'string' && body.frameBase64.length > 0
    ? [body.frameBase64]
    : [];
  const frames = Array.isArray(body.frames)
    ? (body.frames as unknown[])
        .filter((f): f is string => typeof f === 'string' && f.length > 0)
        .slice(0, 5)
    : singleFrame;

  log(TAG, `Enhance request — frames=${frames.length}`, { promptLen: cleanPrompt.length });

  // ── Enhance ─────────────────────────────────────────────────────────────────
  let result: Awaited<ReturnType<typeof enhanceMotionForgePrompt>>;
  try {
    result = await enhanceMotionForgePrompt(cleanPrompt, frames);
  } catch (err) {
    // enhanceMotionForgePrompt is designed never to throw, but be defensive
    logError(TAG, 'Unexpected error from enhanceMotionForgePrompt', err);
    return NextResponse.json(
      { error: 'Enhancement failed unexpectedly' },
      { status: 500 },
    );
  }

  // Truncate extreme edge cases (>1200 chars unlikely but safe)
  const finalPrompt = result.enhancedPrompt.length > 1200
    ? result.enhancedPrompt.slice(0, 1197) + '…'
    : result.enhancedPrompt;

  log(TAG, `Enhancement done`, {
    method:       result.method,
    sceneAnalysed: result.sceneAnalysed,
    outputLen:    finalPrompt.length,
    wordCount:    finalPrompt.split(/\s+/).length,
  });

  return NextResponse.json({
    enhancedPrompt: finalPrompt,   // canonical (spec)
    enhanced:       finalPrompt,   // backward-compat alias for panel main.js
    method:         result.method,
    sceneAnalysed:  result.sceneAnalysed,
  });
}
