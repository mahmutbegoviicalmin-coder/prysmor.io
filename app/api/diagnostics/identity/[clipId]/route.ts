/**
 * GET /api/diagnostics/identity/:clipId
 *
 * Returns per-frame identity diagnostics for the most-recent pipeline run
 * of the given clip.
 *
 * Response shape:
 *   {
 *     clipId:    string
 *     logPath:   string
 *     count:     number
 *     records:   FrameDiagnostics[]   (includes metadata records prefixed with __kind)
 *
 *     // Summary stats (computed server-side)
 *     summary: {
 *       avgIdentityScore:    number
 *       avgAdjustedScore:    number
 *       detectionMethods:    Record<string, number>   // method → frame count
 *       embeddingModels:     Record<string, number>
 *       qualityDistribution: Record<string, number>
 *       restorationModes:    Record<string, number>
 *     }
 *   }
 *
 * Returns 404 when no diagnostics file exists for the clipId.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { readDiagnostics }           from '@/lib/motionforge/diagnostics';
import type { FrameDiagnostics }     from '@/lib/motionforge/diagnostics';

export async function GET(
  _req:    NextRequest,
  { params }: { params: { clipId: string } },
) {
  const { clipId } = params;

  if (!clipId || typeof clipId !== 'string') {
    return NextResponse.json({ error: 'clipId is required' }, { status: 400 });
  }

  const result = readDiagnostics(clipId);
  if (!result) {
    return NextResponse.json(
      { error: `No diagnostics found for clipId: ${clipId}` },
      { status: 404 },
    );
  }

  // ── Compute summary ───────────────────────────────────────────────────────
  const frameRecords = result.records.filter(
    (r): r is FrameDiagnostics => !('__kind' in r),
  );

  const detectionMethods:    Record<string, number> = {};
  const embeddingModels:     Record<string, number> = {};
  const qualityDistribution: Record<string, number> = {};
  const restorationModes:    Record<string, number> = {};

  let sumIdentity  = 0;
  let sumAdjusted  = 0;
  let frameCount   = 0;

  for (const r of frameRecords) {
    if (typeof r.frameIndex !== 'number') continue;  // skip metadata rows

    detectionMethods[r.detectionMethod]       = (detectionMethods[r.detectionMethod]       ?? 0) + 1;
    embeddingModels[r.embeddingModel]          = (embeddingModels[r.embeddingModel]          ?? 0) + 1;
    qualityDistribution[r.frameQuality]        = (qualityDistribution[r.frameQuality]        ?? 0) + 1;
    restorationModes[r.restorationMode]        = (restorationModes[r.restorationMode]        ?? 0) + 1;

    sumIdentity += r.identityScore;
    sumAdjusted += r.adjustedScore;
    frameCount++;
  }

  const summary = {
    avgIdentityScore:    frameCount > 0 ? round3(sumIdentity / frameCount) : 0,
    avgAdjustedScore:    frameCount > 0 ? round3(sumAdjusted / frameCount) : 0,
    detectionMethods,
    embeddingModels,
    qualityDistribution,
    restorationModes,
  };

  return NextResponse.json({
    clipId:   result.clipId,
    logPath:  result.logPath,
    count:    result.count,
    records:  result.records,
    summary,
  });
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
