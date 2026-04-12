import { NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * Current panel version — bump this string to push an OTA update to all installed panels.
 * Panels compare their local version.txt against this value on every Premiere launch.
 */
const PANEL_VERSION = '1.2.0';

const GITHUB_RAW =
  'https://raw.githubusercontent.com/mahmutbegoviicalmin-coder/prysmor.io/main/prysmor-panel/panel';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  // Cache for 5 minutes — panels check on every launch so avoid hammering the API.
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  return NextResponse.json(
    {
      version:       PANEL_VERSION,
      main_js_url:   `${GITHUB_RAW}/main.js`,
      styles_css_url:`${GITHUB_RAW}/styles.css`,
    },
    { headers: CORS },
  );
}
