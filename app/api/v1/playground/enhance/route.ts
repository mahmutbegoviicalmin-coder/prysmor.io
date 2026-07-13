export const runtime = 'nodejs';

import { requireUser } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';
import { enhanceMotionForgePrompt, validatePrompt } from '@/lib/motionforge/promptEnhancer';

export async function POST(req: NextRequest) {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult.user;

  let body: { prompt?: string; mode?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  let cleanPrompt: string;
  try { cleanPrompt = validatePrompt(body.prompt ?? ''); }
  catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'prompt is required' }, { status: 400 });
  }

  const mode = (body.mode ?? 'background').trim();

  const result = await enhanceMotionForgePrompt(cleanPrompt, mode);

  const final = result.enhancedPrompt.length > 1200
    ? result.enhancedPrompt.slice(0, 1197) + '…'
    : result.enhancedPrompt;

  return NextResponse.json({ enhancedPrompt: final, method: result.method });
}
