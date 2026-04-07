export const runtime    = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { getJob, getJobAny, updateJob } from '@/lib/motionforge/jobs';
import { validatePanelToken, validatePanelKey } from '@/lib/motionforge/auth';
import * as os   from 'os';
import * as path from 'path';
import * as fs   from 'fs';
import { uploadToRunway } from '@/lib/motionforge/runway';

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB

function tmpPath(name: string) {
  return path.join(os.tmpdir(), name);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await validatePanelToken(req);
  if (!session && !validatePanelKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let job;
  try {
    job = session
      ? await getJob(session.userId, params.id)
      : await getJobAny(params.id);
  } catch (e) {
    console.error('[upload] getJob failed:', e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.status !== 'created') {
    return NextResponse.json({ error: `Job already in status "${job.status}"` }, { status: 409 });
  }

  const userId = session?.userId ?? job.userId;

  await updateJob(userId, params.id, { status: 'uploading' });

  const inputTmp = tmpPath(`mf-${params.id}-in.mp4`);

  try {
    const arrayBuf = await req.arrayBuffer();
    const buffer   = Buffer.from(arrayBuf);

    console.log(`[upload] Received ${buffer.byteLength} bytes for job ${params.id}`);

    if (buffer.byteLength === 0) {
      await updateJob(userId, params.id, { status: 'failed', error: 'Empty file body' });
      return NextResponse.json({ error: 'Empty file body received' }, { status: 400 });
    }
    if (buffer.byteLength > MAX_FILE_BYTES) {
      await updateJob(userId, params.id, { status: 'failed', error: 'File too large' });
      return NextResponse.json({ error: 'File exceeds 500 MB limit' }, { status: 413 });
    }

    // Write to tmp so we can upload to Runway using the existing helper
    fs.writeFileSync(inputTmp, buffer);
    console.log(`[upload] Written ${buffer.byteLength} bytes to ${inputTmp}`);

    const mediaInSec = parseFloat(req.headers.get('x-media-in')      ?? '0') || 0;
    const clipDurSec = parseFloat(req.headers.get('x-clip-duration') ?? '8') || 8;

    // Upload directly to Runway — returns a runway:// URI valid 24 h
    console.log(`[upload] Uploading to Runway…`);
    const runwayUri = await uploadToRunway(inputTmp);
    console.log(`[upload] Runway URI: ${runwayUri}`);

    await updateJob(userId, params.id, {
      assetUrl:  runwayUri,
      mediaInSec,
      clipDurSec,
    });

    return NextResponse.json({ success: true });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload] Error:', msg);
    await updateJob(userId, params.id, { status: 'failed', error: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    try { if (fs.existsSync(inputTmp)) fs.unlinkSync(inputTmp); } catch (_) {}
  }
}
