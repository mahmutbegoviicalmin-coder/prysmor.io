export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { processEmailQueue } from '@/lib/email/enrollments';
import { processPromptPackFollowUps } from '@/lib/email/promptPackFollowUp';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const queryKey = req.nextUrl.searchParams.get('key');

  if (!secret || (bearer !== secret && queryKey !== secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [funnels, promptPack] = await Promise.all([
      processEmailQueue(30),
      processPromptPackFollowUps(25),
    ]);
    return NextResponse.json({ ok: true, funnels, promptPack });
  } catch (err) {
    console.error('[cron/email-funnels]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cron failed' },
      { status: 500 },
    );
  }
}
