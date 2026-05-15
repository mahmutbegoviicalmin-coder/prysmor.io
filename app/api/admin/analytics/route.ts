import { currentUser }   from '@clerk/nextjs/server';
import { NextResponse }  from 'next/server';
import { db }            from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

const ADMIN_EMAILS = ['mahmutbegoviic.almin@gmail.com'];

export async function GET() {
  const user  = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
  if (!ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const adminUserId = user?.id ?? null;

  try {
    // Last 500 events — exclude dashboard pages and admin user server-side
    const snap = await db.collection('events')
      .orderBy('timestamp', 'desc')
      .limit(500)
      .get();

    /** Returns true for events that should be excluded from analytics */
    function isInternal(page: string, userId: string | null) {
      return page.startsWith('/dashboard') || page.startsWith('/admin') || userId === adminUserId;
    }

    const events = snap.docs
      .map(doc => {
        const d = doc.data();
        return {
          id:         doc.id,
          sessionId:  d.sessionId  ?? null,
          userId:     d.userId     ?? null,
          event:      d.event      ?? '',
          properties: d.properties ?? {},
          page:       d.page       ?? '/',
          referrer:   d.referrer   ?? 'direct',
          userAgent:  d.userAgent  ?? '',
          timestamp:  d.timestamp?.toDate?.()?.toISOString() ?? null,
        };
      })
      .filter(e => !isInternal(e.page, e.userId));

    // Today's events — same filters
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todaySnap = await db.collection('events')
      .where('timestamp', '>=', startOfDay)
      .get();

    const todayEvents = todaySnap.docs
      .map(d => d.data())
      .filter(e => !isInternal(String(e.page ?? '/'), e.userId ?? null));

    const totalToday      = todayEvents.length;
    const pageViewsToday  = todayEvents.filter(e => e.event === 'page_view').length;
    const uniqueSessions  = new Set(todayEvents.map(e => e.sessionId).filter(Boolean)).size;

    // New signups today: count sign_up events today (accurate — only fires once per user).
    // Fallback: count distinct userIds that triggered sign_up today.
    const newSignupsToday = new Set(
      todayEvents
        .filter(e => e.event === 'sign_up' && e.userId)
        .map(e => e.userId as string)
    ).size;

    return NextResponse.json({
      adminUserId,
      events,
      summary: { totalToday, pageViewsToday, uniqueSessions, newSignupsToday },
    });
  } catch (err) {
    console.error('[analytics]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
