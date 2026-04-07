export const runtime    = 'nodejs';
export const maxDuration = 15;

import { NextRequest, NextResponse }  from 'next/server';
import { getJob, getJobAny, updateJob } from '@/lib/motionforge/jobs';
import { validatePanelToken, validatePanelKey } from '@/lib/motionforge/auth';
import { createRunwayUploadSlot }     from '@/lib/motionforge/runway';

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

  try {
    const filename = `clip-${params.id}.mp4`;
    const slot = await createRunwayUploadSlot(filename);

    // Mark job as uploading so the panel knows to proceed
    await updateJob(userId, params.id, { status: 'uploading' });

    return NextResponse.json({
      uploadUrl: slot.uploadUrl,
      fields:    slot.fields,
      runwayUri: slot.runwayUri,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateJob(userId, params.id, { status: 'failed', error: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
