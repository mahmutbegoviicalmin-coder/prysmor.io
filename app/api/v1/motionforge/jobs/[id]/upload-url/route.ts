export const runtime    = 'nodejs';
export const maxDuration = 15;

import { NextRequest, NextResponse }  from 'next/server';
import { getJob, getJobAny, updateJob } from '@/lib/motionforge/jobs';
import { validatePanelToken, validatePanelKey } from '@/lib/motionforge/auth';
import { createRunwayUploadSlot }        from '@/lib/motionforge/runway';
import { createBeebleUploadSlot }        from '@/lib/motionforge/beeble';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await validatePanelToken(req);
  if (!session && !validatePanelKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const job = session
    ? await getJob(session.userId, params.id).catch(() => null)
    : await getJobAny(params.id).catch(() => null);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.status !== 'created') {
    return NextResponse.json({ error: `Job already in status "${job.status}"` }, { status: 409 });
  }

  const userId = session?.userId ?? job.userId;

  // Panel passes ?mode= so we know which backend to prepare an upload slot for
  const mode         = (req.nextUrl.searchParams.get('mode') ?? '').toLowerCase();
  const isBeebleMode = mode === 'background' || mode === 'relight';

  try {
    const filename = `clip-${params.id}.mp4`;

    await updateJob(userId, params.id, { status: 'uploading' });

    if (isBeebleMode) {
      // ── Beeble SwitchX: return a pre-signed PUT slot ────────────────────
      const slot = await createBeebleUploadSlot(filename);
      console.log(`[upload-url] Beeble slot for job ${params.id}: ${slot.beebleUri}`);
      return NextResponse.json({
        uploadUrl:    slot.uploadUrl,
        beebleUri:    slot.beebleUri,
        uploadMethod: 'put',          // panel switches from FormData POST → raw PUT
      });
    } else {
      // ── Runway: return a pre-signed S3 FormData slot ────────────────────
      const slot = await createRunwayUploadSlot(filename);
      return NextResponse.json({
        uploadUrl:    slot.uploadUrl,
        fields:       slot.fields,
        runwayUri:    slot.runwayUri,
        uploadMethod: 'post',
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateJob(userId, params.id, { status: 'failed', error: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
