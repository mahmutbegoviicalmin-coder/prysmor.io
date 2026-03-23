/**
 * GET /api/diagnostics/identity/:clipId/anchors
 *
 * Returns AnchorProfile status for a clip — how many embeddings were
 * collected, their quality distribution, and per-subject summaries.
 *
 * Reads directly from the JSON cache files written by AnchorProfile.persist().
 *
 * Response shape:
 *   {
 *     clipId:   string
 *     subjects: {
 *       [subjectId]: {
 *         subjectId:    string
 *         anchorCount:  number
 *         bestQuality:  EmbeddingQuality
 *         avgConfidence: number
 *         cachePath:    string
 *         exists:       boolean
 *       } | null
 *     }
 *     collectionComplete: boolean   // true when at least one subject has >= 3 anchors
 *   }
 *
 * Query params:
 *   subjects=artist_1,artist_2   (comma-separated, defaults to "primary")
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import * as fs   from 'fs';
import * as path from 'path';
import { getAnchorStatus }           from '@/lib/motionforge/identityAnalysis';

export async function GET(
  req:     NextRequest,
  { params }: { params: { clipId: string } },
) {
  const { clipId } = params;
  if (!clipId || typeof clipId !== 'string') {
    return NextResponse.json({ error: 'clipId is required' }, { status: 400 });
  }

  const url      = new URL(req.url);
  const rawSubs  = url.searchParams.get('subjects') ?? 'primary';
  const subjects = rawSubs.split(',').map(s => s.trim()).filter(Boolean);

  const subjectStatus = getAnchorStatus(clipId, subjects);

  // Check cache file existence for each subject
  const ANCHOR_CACHE_DIR = path.join(process.cwd(), 'cache', 'anchors');
  const detailed: Record<string, object | null> = {};

  for (const subjectId of subjects) {
    const summary = subjectStatus[subjectId];
    const safeCid = clipId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
    const safeSid = subjectId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
    const cachePath = path.join(ANCHOR_CACHE_DIR, `${safeCid}-${safeSid}.json`);
    const exists    = fs.existsSync(cachePath);

    detailed[subjectId] = summary
      ? { ...summary, cachePath, exists }
      : (exists ? { subjectId, anchorCount: 0, cachePath, exists } : null);
  }

  const collectionComplete = Object.values(detailed).some(
    s => s !== null && typeof s === 'object' && 'anchorCount' in s && (s as { anchorCount: number }).anchorCount >= 3,
  );

  return NextResponse.json({
    clipId,
    subjects:           detailed,
    collectionComplete,
  });
}
