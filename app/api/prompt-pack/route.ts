import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { db } from '@/lib/firebaseAdmin';
import { sendPromptPackEmail } from '@/lib/email/transactional';
import { PROMPT_PACK_FOLLOW_UP_MS } from '@/lib/email/promptPackFollowUp';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour per email
const IP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const IP_MAX_PER_WINDOW = 1; // max 1 pack / IP / hour
const IP_DAY_MS = 24 * 60 * 60 * 1000;
const IP_MAX_PER_DAY = 2; // hard daily cap per IP

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function emailDocId(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 32);
}

function ipDocId(ip: string): string {
  return createHash('sha256').update(`prompt_pack_ip:${ip}`).digest('hex').slice(0, 32);
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Sliding fixed-window counter in Firestore.
 * Returns false when the limit is hit.
 */
async function consumeIpQuota(ip: string): Promise<{ ok: boolean; reason?: string }> {
  if (!db || ip === 'unknown') {
    // Without a reliable IP or DB, skip IP limiting rather than locking everyone out.
    return { ok: true };
  }

  const now = Date.now();
  const ref = db.collection('rate_limits').doc(`prompt_pack_ip_${ipDocId(ip)}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data()! : null;

    let hourStart = (data?.hourStart as number | undefined) ?? now;
    let hourCount = (data?.hourCount as number | undefined) ?? 0;
    let dayStart = (data?.dayStart as number | undefined) ?? now;
    let dayCount = (data?.dayCount as number | undefined) ?? 0;

    if (now - hourStart > IP_WINDOW_MS) {
      hourStart = now;
      hourCount = 0;
    }
    if (now - dayStart > IP_DAY_MS) {
      dayStart = now;
      dayCount = 0;
    }

    if (hourCount >= IP_MAX_PER_WINDOW) {
      return { ok: false, reason: 'hour' };
    }
    if (dayCount >= IP_MAX_PER_DAY) {
      return { ok: false, reason: 'day' };
    }

    tx.set(
      ref,
      {
        hourStart,
        hourCount: hourCount + 1,
        dayStart,
        dayCount: dayCount + 1,
        updatedAt: now,
      },
      { merge: true },
    );
    return { ok: true };
  });
}

export async function POST(req: NextRequest) {
  let body: { email?: string; website?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Honeypot: bots often fill hidden fields. Pretend success, send nothing.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true });
  }

  const email = normalizeEmail(body.email ?? '');
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }

  const ip = clientIp(req);
  const docId = emailDocId(email);

  try {
    // Per-email cooldown first so retries on the same address do not burn IP quota.
    if (db) {
      const ref = db.collection('prompt_pack_leads').doc(docId);
      const snap = await ref.get();
      const lastSentAt = snap.data()?.lastSentAt?.toMillis?.() as number | undefined;
      if (lastSentAt && Date.now() - lastSentAt < EMAIL_COOLDOWN_MS) {
        return NextResponse.json({ ok: true });
      }
    }

    const ipQuota = await consumeIpQuota(ip).catch(() => ({ ok: true as const }));
    if (!ipQuota.ok) {
      return NextResponse.json(
        { error: 'You already used your free Prompt Pack. Come back later or buy lifetime access.' },
        { status: 429 },
      );
    }

    const pdfPath = path.join(process.cwd(), 'public', 'prysmor-prompt-pack.pdf');
    const pdf = await readFile(pdfPath);
    const result = await sendPromptPackEmail({ to: email, pdf });
    if (!result.ok) {
      console.error('[prompt-pack] send failed', result.error);
      return NextResponse.json(
        { error: 'Could not send the email right now. Try again in a minute.' },
        { status: 502 },
      );
    }

    if (db) {
      const ref = db.collection('prompt_pack_leads').doc(docId);
      const snap = await ref.get();
      const alreadyFollowedUp = snap.data()?.followUpStatus === 'sent';
      await ref.set(
        {
          email,
          ip,
          updatedAt: FieldValue.serverTimestamp(),
          lastSentAt: FieldValue.serverTimestamp(),
          sendCount: FieldValue.increment(1),
          createdAt: snap.exists
            ? snap.data()?.createdAt ?? FieldValue.serverTimestamp()
            : FieldValue.serverTimestamp(),
          ...(alreadyFollowedUp
            ? {}
            : {
                followUpStatus: 'pending',
                followUpAt: Timestamp.fromMillis(Date.now() + PROMPT_PACK_FOLLOW_UP_MS),
              }),
        },
        { merge: true },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[prompt-pack]', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
