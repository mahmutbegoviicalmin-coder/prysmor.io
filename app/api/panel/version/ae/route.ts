import { NextResponse } from 'next/server';

export const runtime = 'edge';

/** After Effects panel OTA version — bump to push updates to installed AE panels. */
const PANEL_AE_VERSION = '2.0.1';

const GITHUB_RAW =
  'https://raw.githubusercontent.com/mahmutbegoviicalmin-coder/prysmor.io/main/prysmor-panel-ae/panel';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  return NextResponse.json(
    {
      version:        PANEL_AE_VERSION,
      main_js_url:    `${GITHUB_RAW}/main.js`,
      styles_css_url: `${GITHUB_RAW}/styles.css`,
      index_html_url: `${GITHUB_RAW}/index.html`,
      host_jsx_url:   `${GITHUB_RAW}/host.jsx`,
    },
    { headers: CORS },
  );
}
