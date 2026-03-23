export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { validatePanelKey, validatePanelToken } from '@/lib/motionforge/auth';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * GET /api/v1/motionforge/jobs/[id]/output
 *
 * Streams the composited video file for a completed job.
 * The file is stored in os.tmpdir() as "prysmor-output-{id}.mp4".
 * This avoids Firestore's 1MB field size limit when storing base64 video.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await validatePanelToken(req);
  if (!session && !validatePanelKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const filePath = path.join(os.tmpdir(), `prysmor-output-${params.id}.mp4`);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Output not found' }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type':        'video/mp4',
      'Content-Length':      String(buffer.length),
      'Content-Disposition': `inline; filename="prysmor-${params.id}.mp4"`,
      'Cache-Control':       'no-store',
    },
  });
}
