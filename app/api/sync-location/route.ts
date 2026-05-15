import { auth }           from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { updateUserCountry } from '@/lib/firestore/users';

export const runtime = 'nodejs';

/* ISO 3166-1 alpha-2 → full name (most common) */
const COUNTRY_NAMES: Record<string, string> = {
  AF:"Afghanistan",AL:"Albania",DZ:"Algeria",AR:"Argentina",AM:"Armenia",
  AU:"Australia",AT:"Austria",AZ:"Azerbaijan",BH:"Bahrain",BD:"Bangladesh",
  BY:"Belarus",BE:"Belgium",BZ:"Belize",BJ:"Benin",BO:"Bolivia",
  BA:"Bosnia and Herzegovina",BW:"Botswana",BR:"Brazil",BG:"Bulgaria",
  KH:"Cambodia",CM:"Cameroon",CA:"Canada",CL:"Chile",CN:"China",
  CO:"Colombia",CD:"Congo (DRC)",CR:"Costa Rica",HR:"Croatia",CU:"Cuba",
  CY:"Cyprus",CZ:"Czech Republic",DK:"Denmark",DO:"Dominican Republic",
  EC:"Ecuador",EG:"Egypt",SV:"El Salvador",EE:"Estonia",ET:"Ethiopia",
  FI:"Finland",FR:"France",GE:"Georgia",DE:"Germany",GH:"Ghana",
  GR:"Greece",GT:"Guatemala",HN:"Honduras",HK:"Hong Kong",HU:"Hungary",
  IN:"India",ID:"Indonesia",IR:"Iran",IQ:"Iraq",IE:"Ireland",
  IL:"Israel",IT:"Italy",JM:"Jamaica",JP:"Japan",JO:"Jordan",
  KZ:"Kazakhstan",KE:"Kenya",KW:"Kuwait",LV:"Latvia",LB:"Lebanon",
  LT:"Lithuania",LU:"Luxembourg",MY:"Malaysia",MX:"Mexico",MD:"Moldova",
  MA:"Morocco",MZ:"Mozambique",MM:"Myanmar",NP:"Nepal",NL:"Netherlands",
  NZ:"New Zealand",NI:"Nicaragua",NG:"Nigeria",KP:"North Korea",MK:"North Macedonia",
  NO:"Norway",OM:"Oman",PK:"Pakistan",PS:"Palestine",PA:"Panama",
  PY:"Paraguay",PE:"Peru",PH:"Philippines",PL:"Poland",PT:"Portugal",
  QA:"Qatar",RO:"Romania",RU:"Russia",SA:"Saudi Arabia",SN:"Senegal",
  RS:"Serbia",SG:"Singapore",SK:"Slovakia",SI:"Slovenia",ZA:"South Africa",
  KR:"South Korea",ES:"Spain",LK:"Sri Lanka",SD:"Sudan",SE:"Sweden",
  CH:"Switzerland",SY:"Syria",TW:"Taiwan",TZ:"Tanzania",TH:"Thailand",
  TN:"Tunisia",TR:"Turkey",UG:"Uganda",UA:"Ukraine",AE:"United Arab Emirates",
  GB:"United Kingdom",US:"United States",UY:"Uruguay",UZ:"Uzbekistan",
  VE:"Venezuela",VN:"Vietnam",YE:"Yemen",ZM:"Zambia",ZW:"Zimbabwe",
};

function getCountryName(code: string): string {
  return COUNTRY_NAMES[code.toUpperCase()] ?? code;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  /* ── 1. Try Vercel built-in geo headers (fast, no external call) ── */
  const vercelCountryCode = req.headers.get('x-vercel-ip-country');
  if (vercelCountryCode && vercelCountryCode.length === 2) {
    const countryName = getCountryName(vercelCountryCode);
    await updateUserCountry(userId, countryName, vercelCountryCode.toUpperCase());
    return NextResponse.json({ ok: true, country: countryName, source: 'vercel' });
  }

  /* ── 2. Fallback: ip-api.com (works on localhost / non-Vercel) ── */
  const raw = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip');
  const ip  = raw?.split(',')[0].trim();

  const PRIVATE = ['127.','10.','192.168.','::1','localhost'];
  if (!ip || PRIVATE.some(p => ip.startsWith(p))) {
    return NextResponse.json({ ok: false, reason: 'private_ip' });
  }

  try {
    const geo  = await fetch(`https://ipinfo.io/${ip}/json`, { signal: AbortSignal.timeout(4000) });
    const data = await geo.json() as { country?: string; bogon?: boolean };
    if (!data.country || data.bogon) {
      return NextResponse.json({ ok: false, reason: 'geo_failed' });
    }
    const code = data.country.toUpperCase();
    const name = getCountryName(code);
    await updateUserCountry(userId, name, code);
    return NextResponse.json({ ok: true, country: name, source: 'ipinfo' });
  } catch (err) {
    console.warn('[sync-location] failed:', err);
    return NextResponse.json({ ok: false, reason: 'exception' });
  }
}
