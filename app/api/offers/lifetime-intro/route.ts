import { NextResponse } from 'next/server';
import { getLifetimeIntroOffer } from '@/lib/offers/lifetimeIntro';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public scarcity state for the $99 lifetime intro (first 100 buyers). */
export async function GET() {
  try {
    const offer = await getLifetimeIntroOffer();
    return NextResponse.json(offer, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    console.error('[offers/lifetime-intro]', err);
    return NextResponse.json(
      { claimed: 45, limit: 100, remaining: 55, soldOut: false },
      { status: 200 },
    );
  }
}
