import { auth }           from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { updateUserCountry } from '@/lib/firestore/users';

export const runtime = 'nodejs';

function extractIp(req: NextRequest): string | null {
  // In production (Vercel / behind proxy), the real IP is in x-forwarded-for
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first && first !== '::1' && !first.startsWith('127.') && !first.startsWith('10.') && !first.startsWith('192.168.')) {
      return first;
    }
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp !== '::1') return realIp;
  return null;
}

interface IpApiResponse {
  status:      string;
  country:     string;
  countryCode: string;
  city?:       string;
  query:       string;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const ip = extractIp(req);
  if (!ip) {
    // Localhost / private IP — skip silently
    return NextResponse.json({ ok: false, reason: 'private_ip' });
  }

  try {
    const geo = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,query`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!geo.ok) {
      return NextResponse.json({ ok: false, reason: 'geo_api_error' });
    }
    const data: IpApiResponse = await geo.json();
    if (data.status !== 'success' || !data.country) {
      return NextResponse.json({ ok: false, reason: 'geo_failed' });
    }

    await updateUserCountry(userId, data.country, data.countryCode);
    return NextResponse.json({ ok: true, country: data.country });
  } catch (err) {
    // Non-fatal — country is optional
    console.warn('[sync-location] failed:', err);
    return NextResponse.json({ ok: false, reason: 'exception' });
  }
}
