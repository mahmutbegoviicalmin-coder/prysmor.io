export const runtime = 'nodejs';

/**
 * POST /api/v1/motionforge/compile-prompt
 *
 * Text-only prompt enhancement (no vision, no job needed).
 * Used as fallback when no video has been uploaded yet.
 *
 * Body: { prompt: string }
 * Returns: { compiledPrompt, effectType, method }
 */

import { NextRequest, NextResponse } from 'next/server';
import { validatePanelKey, validatePanelToken } from '@/lib/motionforge/auth';
import { compileVfxPrompt } from '@/lib/motionforge/promptCompiler';

export async function POST(req: NextRequest) {
  const session = await validatePanelToken(req);
  if (!session && !validatePanelKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { prompt?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const prompt = (body.prompt ?? '').trim();
  if (!prompt) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  const result = await compileVfxPrompt(prompt);

  return NextResponse.json({
    compiledPrompt: result.compiledPrompt,
    effectType:     result.effectType,
    method:         result.method,
  });
}
