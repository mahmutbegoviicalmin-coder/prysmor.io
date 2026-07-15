import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSessionUser } from '@/lib/auth/session';
import { getUser } from '@/lib/firestore/users';

export const runtime = 'nodejs';

/** Active license holders can download the Prompt Pack PDF. */
export async function GET() {
  const session = await getSessionUser().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getUser(session.userId).catch(() => null);
  if (user?.licenseStatus !== 'active') {
    return NextResponse.json({ error: 'Active license required' }, { status: 403 });
  }

  try {
    const pdfPath = path.join(process.cwd(), 'public', 'prysmor-prompt-pack.pdf');
    const pdf = await readFile(pdfPath);
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="prysmor-prompt-pack.pdf"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('[prompt-pack/download]', err);
    return NextResponse.json({ error: 'File unavailable' }, { status: 500 });
  }
}
