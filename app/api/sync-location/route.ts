import { auth }           from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { updateUserCountry } from '@/lib/firestore/users';

export const runtime = 'nodejs';

const PRIVATE_PREFIXES = ['127.', '10.', '192.168.', '172.16.', '172.17.',
  '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
  '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.'];

function isPrivateIp(ip: string): boolean {
  return ip === '::1' || ip === 'localhost' || PRIVATE_PREFIXES.some(p => ip.startsWith(p));
}

function extractIp(req: NextRequest): string | null {
  // Try all common proxy/CDN headers (Vercel uses x-forwarded-for + x-vercel-forwarded-for)
  const candidates = [
    req.headers.get('x-vercel-forwarded-for'),  // Vercel-specific
    req.headers.get('x-forwarded-for'),          // Standard proxy header
    req.headers.get('x-real-ip'),                // nginx
    req.headers.get('cf-connecting-ip'),         // Cloudflare
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const ip = raw.split(',')[0].trim();
    if (ip && !isPrivateIp(ip)) return ip;
  }
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
