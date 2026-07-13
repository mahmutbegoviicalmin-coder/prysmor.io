import { NextResponse } from 'next/server';
import { getSessionUser, type SessionUser } from '@/lib/auth/session';

export const ADMIN_EMAILS = ['mahmutbegoviic.almin@gmail.com'];

export async function requireAdmin(): Promise<
  | { ok: true; user: SessionUser; adminEmail: string }
  | { ok: false; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!ADMIN_EMAILS.includes(user.email)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, user, adminEmail: user.email };
}
