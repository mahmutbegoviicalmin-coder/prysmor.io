export const runtime    = 'nodejs';
export const maxDuration = 10;

import { NextRequest, NextResponse }  from 'next/server';
import { getJob, updateJob }          from '@/lib/motionforge/jobs';
import { validatePanelToken, validatePanelKey } from '@/lib/motionforge/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await validatePanelToken(req);
  if (!session && !validatePanelKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { runwayUri?: string; mediaInSec?: number; clipDurSec?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { runwayUri, mediaInSec = 0, clipDurSec = 8 } = body;
  if (!runwayUri || !runwayUri.startsWith('runway://')) {
    return NextResponse.json({ error: 'Missing or invalid runwayUri' }, { status: 400 });
  }

  const job = await getJob(params.id).catch(() => null);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  try {
    // Keep status as 'uploading' — generate route validates this status
    await updateJob(params.id, {
      assetUrl:  runwayUri,
      mediaInSec,
      clipDurSec,
    });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
