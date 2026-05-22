import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, properties, page } = body;

    if (!event || typeof event !== 'string') {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Skip internal pages
    const pagePath = String(page ?? '/');
    if (pagePath.startsWith('/dashboard') || pagePath.startsWith('/admin')) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Log to Vercel function logs — no database writes needed
    console.log(`[track] event=${event} page=${pagePath}`, JSON.stringify(properties ?? {}));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[track]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
