import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken, unsubscribeUser } from '@/lib/email/unsubscribe';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return htmlResponse('Invalid link', 'Missing unsubscribe token.', 400);
  }

  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return htmlResponse('Invalid link', 'This unsubscribe link is invalid or expired.', 400);
  }

  try {
    await unsubscribeUser(userId);
    return htmlResponse(
      'Unsubscribed',
      'You will no longer receive product and marketing emails from Prysmor. Support messages about your account may still be sent when you contact us.',
      200,
    );
  } catch (err) {
    console.error('[email/unsubscribe]', err);
    return htmlResponse('Error', 'Something went wrong. Email support@prysmor.io to unsubscribe.', 500);
  }
}

function htmlResponse(title: string, message: string, status: number) {
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui;background:#0a0a0a;color:#e5e7eb;padding:40px;text-align:center;">
    <h1 style="color:#39FF6A;font-size:20px;">${title}</h1>
    <p style="max-width:400px;margin:16px auto;color:#9ca3af;line-height:1.6;">${message}</p>
    <a href="https://prysmor.io/dashboard" style="color:#39FF6A;">Back to dashboard</a>
  </body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
