import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, userId, event, properties, page, referrer, userAgent } = body;

    if (!event || typeof event !== 'string') {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Drop internal traffic before writing to Firestore
    const pagePath = String(page ?? '/');
    if (pagePath.startsWith('/dashboard') || pagePath.startsWith('/admin')) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await db.collection('events').add({
      sessionId: sessionId ?? null,
      userId:    userId    ?? null,
      event,
      properties: properties ?? {},
      page:       page       ?? '/',
      referrer:   referrer   ?? 'direct',
      userAgent:  userAgent  ?? '',
      timestamp:  FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[track]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
