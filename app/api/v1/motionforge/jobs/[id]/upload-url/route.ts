export const runtime    = 'nodejs';
export const maxDuration = 15;

import { NextRequest, NextResponse }  from 'next/server';
import { getJob, getJobAny, updateJob } from '@/lib/motionforge/jobs';
import { validatePanelToken, validatePanelKey } from '@/lib/motionforge/auth';
import { createBeebleUploadSlot }        from '@/lib/motionforge/beeble';
import { createRunwayUploadSlot }         from '@/lib/motionforge/runway';

const OMNI_PLANS = new Set(['pro', 'exclusive', 'creator', 'creator-suite']);

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
  const mode   = (req.nextUrl.searchParams.get('mode') ?? '').toLowerCase();

  // Plan guard for Omni mode
  if (mode === 'omni' && session) {
    if (!OMNI_PLANS.has(session.plan)) {
      return NextResponse.json(
        { error: 'Gemini Omni requires a Pro or Exclusive plan. Upgrade at prysmor.io/pricing' },
        { status: 403 },
      );
    }
  }

  try {
    await updateJob(userId, params.id, { status: 'uploading' });

    if (mode === 'background' || mode === 'relight') {
      // ── Beeble SwitchX ────────────────────────────────────────────────────
      const slot = await createBeebleUploadSlot(`clip-${params.id}.mp4`);
      console.log(`[upload-url] Beeble slot for job ${params.id}`);
      return NextResponse.json({
        uploadUrl:    slot.uploadUrl,
        beebleUri:    slot.beebleUri,
        uploadMethod: 'put',
      });

    } else if (mode === 'omni') {
      // ── KIE.AI Gemini Omni: direct client → Vercel Blob upload ────────────
      // Panel uploads directly to Vercel Blob (bypasses our serverless function
      // entirely, avoiding the 4.5 MB body size limit).
      const { generateClientTokenFromReadWriteToken } = await import('@vercel/blob/client');
      const pathname = `vfx-input/${params.id}.mp4`;
      const clientToken = await generateClientTokenFromReadWriteToken({
        token:               process.env.BLOB_READ_WRITE_TOKEN!,
        pathname,
        allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/*'],
        maximumSizeInBytes:  500 * 1024 * 1024, // 500 MB
      });
      console.log(`[upload-url] Vercel Blob direct-upload slot for job ${params.id}`);
      return NextResponse.json({
        uploadUrl:       `https://blob.vercel-storage.com`,
        blobPathname:    pathname,
        blobClientToken: clientToken,
        uploadMethod:    'blob-direct',
        kieMode:         true,
      });

    } else {
      // ── Runway (VFX + any other mode) ─────────────────────────────────────
      const slot = await createRunwayUploadSlot(`clip-${params.id}.mp4`);
      console.log(`[upload-url] Runway slot for job ${params.id}`);
      return NextResponse.json({
        uploadUrl:    slot.uploadUrl,
        fields:       slot.fields,
        runwayUri:    slot.runwayUri,
        uploadMethod: 'post',
      });
    }

  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    const msg = raw.includes('API_KEY') || raw.includes('api_key')
      ? 'Generation service temporarily unavailable. Please try again.'
      : raw;
    await updateJob(userId, params.id, { status: 'failed', error: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
