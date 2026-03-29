export const runtime    = 'nodejs';
export const maxDuration = 15;

import { NextRequest, NextResponse }  from 'next/server';
import { getJob, updateJob }          from '@/lib/motionforge/jobs';
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

  const job = await getJob(params.id).catch(() => null);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.status !== 'created') {
    return NextResponse.json({ error: `Job already in status "${job.status}"` }, { status: 409 });
  }

  try {
    const filename = `clip-${params.id}.mp4`;
    const slot = await createRunwayUploadSlot(filename);

    // Mark job as uploading so the panel knows to proceed
    await updateJob(params.id, { status: 'uploading' });

    return NextResponse.json({
      uploadUrl: slot.uploadUrl,
      fields:    slot.fields,
      runwayUri: slot.runwayUri,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateJob(params.id, { status: 'failed', error: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
