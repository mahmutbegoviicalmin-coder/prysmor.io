export const runtime    = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/v1/motionforge/jobs/[id]/enhance-prompt
 *
 * Scene-aware VFX prompt generator.
 *
 * Extracts a key frame from the job's uploaded video, sends it to GPT-4o Vision
 * to analyze the scene (subjects, background, lighting, mood), then generates
 * a precise Runway VFX prompt tailored to the exact scene content.
 *
 * Body: { intent: string }  — brief user description ("dramatic storm", "luxury city")
 *
 * Returns:
 *   { prompt, effectType, sceneAnalysis, method }
 */

import { NextRequest, NextResponse }    from 'next/server';
import { getJob }                        from '@/lib/motionforge/jobs';
import { validatePanelKey, validatePanelToken } from '@/lib/motionforge/auth';
import { generateSceneAwarePrompt }      from '@/lib/motionforge/sceneAnalyzer';
import { extractFrameAt, probeVideo }    from '@/lib/motionforge/frameExtract';
import { log, warn }                     from '@/lib/motionforge/logger';
import * as fs   from 'fs';
import * as os   from 'os';
import * as path from 'path';

const TAG = 'enhance-prompt';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await validatePanelToken(req);
  if (!session && !validatePanelKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Job lookup ────────────────────────────────────────────────────────────
  const job = await getJob(params.id);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  // Prefer the preserved original (survives generate), fall back to upload copy
  const preservedPath = path.join(os.tmpdir(), `orig-${params.id}.mp4`);
  const videoPath =
    (fs.existsSync(preservedPath) ? preservedPath : null) ??
    (job.assetUrl && fs.existsSync(job.assetUrl) ? job.assetUrl : null) ??
    ((job as any).originalVideoPath && fs.existsSync((job as any).originalVideoPath)
      ? (job as any).originalVideoPath
      : null);

  if (!videoPath) {
    // No video on disk — fall back to text-only compile
    warn(TAG, `No video found for job ${params.id} — falling back to text compile`);
    const { compileVfxPrompt } = await import('@/lib/motionforge/promptCompiler');
    const result = await compileVfxPrompt(userIntent).catch(() => ({
      compiledPrompt: userIntent,
      effectType: 'background' as const,
      method: 'fallback' as const,
    }));
    return NextResponse.json({
      prompt:        result.compiledPrompt,
      effectType:    result.effectType,
      sceneAnalysis: null,
      method:        'fallback',
    });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { intent?: string };
  try { body = await req.json(); }
  catch { body = {}; }

  const userIntent = (body.intent ?? '').trim() || 'make it cinematic and dramatic';
  log(TAG, `Enhance-prompt request for job ${params.id}`, { userIntent });

  // ── Extract representative frame ──────────────────────────────────────────
  let framePath: string | null = null;
  try {
    const { duration } = await probeVideo(videoPath);
    // Use the 30% mark — usually past any intro cut, good representative frame
    const frameTs = Math.max(0.5, duration * 0.3);
    framePath = await extractFrameAt(videoPath, frameTs, os.tmpdir(), `enhance-${params.id}`);
    log(TAG, `Frame extracted at ${frameTs.toFixed(2)}s → ${framePath}`);
  } catch (err) {
    warn(TAG, 'Frame extraction failed', { err: (err as Error).message });
    return NextResponse.json(
      { error: 'Could not extract frame from video' },
      { status: 500 },
    );
  }

  // ── Generate scene-aware prompt ───────────────────────────────────────────
  try {
    const result = await generateSceneAwarePrompt(framePath, userIntent);
    log(TAG, 'Enhance-prompt complete', { effectType: result.effectType, method: result.method });

    return NextResponse.json(result);

  } finally {
    // Clean up extracted frame regardless of success/failure
    try { if (framePath && fs.existsSync(framePath)) fs.unlinkSync(framePath); } catch (_) {}
  }
}
