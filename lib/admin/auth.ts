import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export const ADMIN_EMAILS = ['mahmutbegoviic.almin@gmail.com'];

export async function requireAdmin() {
  const user = await currentUser();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const emails = user.emailAddresses?.map((e) => e.emailAddress) ?? [];
  const adminEmail = emails.find((e) => ADMIN_EMAILS.includes(e));
  if (!adminEmail) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const, user, adminEmail };
}
