export const runtime    = 'nodejs';
export const maxDuration = 10;

import { NextRequest, NextResponse }  from 'next/server';
import { getJob, getJobAny, updateJob } from '@/lib/motionforge/jobs';
import { validatePanelToken, validatePanelKey } from '@/lib/motionforge/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await validatePanelToken(req);
  if (!session && !validatePanelKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    runwayUri?:  string;
    beebleUri?:  string;
    kieAssetUrl?: string;
    mediaInSec?: number;
    clipDurSec?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { runwayUri, beebleUri, kieAssetUrl, mediaInSec = 0, clipDurSec = 8 } = body;

  if (runwayUri && !runwayUri.startsWith('runway://')) {
    return NextResponse.json({ error: 'Invalid runwayUri' }, { status: 400 });
  }

  const job = session
    ? await getJob(session.userId, params.id).catch(() => null)
    : await getJobAny(params.id).catch(() => null);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const userId = session?.userId ?? job.userId;

  // KIE.AI PUT path: assetUrl already stored by the upload/PUT handler.
  // Accept upload-complete even if no URI is provided in the body.
  const existingAsset = (job as any).assetUrl as string | undefined;
  if (!runwayUri && !beebleUri && !kieAssetUrl && !existingAsset) {
    return NextResponse.json(
      { error: 'Missing runwayUri, beebleUri, or kieAssetUrl' },
      { status: 400 },
    );
  }

  try {
    const assetUrl = beebleUri ?? kieAssetUrl ?? runwayUri ?? existingAsset!;
    await updateJob(userId, params.id, {
      assetUrl,
      mediaInSec,
      clipDurSec,
      ...(beebleUri   ? { beebleVideoUri: beebleUri }   : {}),
      ...(kieAssetUrl ? { kieAssetUrl }                 : {}),
    } as any);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
