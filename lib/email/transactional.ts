import { Resend } from 'resend';
import { MARKETING_FROM, appBaseUrl } from './constants';
import { PLAN_LABELS } from '@/lib/firestore/users';
import { setPasswordLinkUrl } from '@/lib/auth/magic';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function wrapTransactionalHtml(innerHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="color:#39FF6A;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin:0 0 24px;">
      Prysmor
    </p>
    <div style="background:#111113;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:28px 24px;">
      ${innerHtml}
    </div>
    <p style="margin:24px 0 0;font-size:11px;color:#4b5563;line-height:1.5;text-align:center;">
      Questions? Reply to this email or visit
      <a href="${appBaseUrl()}/dashboard/support" style="color:#6b7280;text-decoration:underline;">prysmor.io/support</a>
    </p>
  </div>
</body>
</html>`;
}

function planLabel(plan: string): string {
  return PLAN_LABELS[plan] ?? plan;
}

/** After purchase: set password to activate web + panel login. */
export async function sendPurchaseMagicEmail(opts: {
  to: string;
  plan: string;
  redirect?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const link = setPasswordLinkUrl(opts.to, 'purchase');
  const label = planLabel(opts.plan);
  const innerHtml = `
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#ffffff;font-weight:700;">
      Thanks for your order
    </h1>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#9ca3af;">
      Your <strong style="color:#ffffff;">${label}</strong> plan is ready.
      Choose a password for <strong style="color:#ffffff;">${opts.to}</strong> to open your dashboard and connect Premiere / After Effects.
    </p>
    <a href="${link}"
       style="display:inline-block;background:#39FF6A;color:#000000;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;padding:13px 20px;border-radius:10px;">
      Set your password
    </a>
    <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">
      This link expires in 48 hours. After that you can use Forgot password on the sign-in page.
    </p>
  `;

  try {
    const { error } = await resend.emails.send({
      from: MARKETING_FROM,
      to: opts.to,
      subject: 'Set your Prysmor password',
      html: wrapTransactionalHtml(innerHtml),
    });
    if (error) return { ok: false, error: error.message ?? String(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Send failed' };
  }
}

export async function sendSetPasswordEmail(opts: {
  to: string;
  purpose?: 'set-password' | 'reset-password';
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const purpose = opts.purpose ?? 'set-password';
  const link = setPasswordLinkUrl(opts.to, purpose);
  const isReset = purpose === 'reset-password';
  const innerHtml = `
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#ffffff;font-weight:700;">
      ${isReset ? 'Reset your password' : 'Set your password'}
    </h1>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#9ca3af;">
      ${isReset
        ? 'Choose a new password to sign in to your Prysmor dashboard and panels.'
        : 'Finish activating your Prysmor account by choosing a password.'}
    </p>
    <a href="${link}"
       style="display:inline-block;background:#39FF6A;color:#000000;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;padding:13px 20px;border-radius:10px;">
      ${isReset ? 'Reset password' : 'Set password'}
    </a>
    <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">
      This link expires in 48 hours. If you did not request it, you can ignore this email.
    </p>
  `;

  try {
    const { error } = await resend.emails.send({
      from: MARKETING_FROM,
      to: opts.to,
      subject: isReset ? 'Reset your Prysmor password' : 'Set your Prysmor password',
      html: wrapTransactionalHtml(innerHtml),
    });
    if (error) return { ok: false, error: error.message ?? String(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Send failed' };
  }
}

/** @deprecated Magic login disabled — use password + forgot-password. */
export async function sendMagicLoginEmail(opts: {
  to: string;
  redirect?: string;
}): Promise<{ ok: boolean; error?: string }> {
  return sendSetPasswordEmail({ to: opts.to, purpose: 'set-password' });
}

export async function sendOrderConfirmedEmail(opts: {
  to: string;
  plan: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const signInUrl = `${appBaseUrl()}/sign-in`;
  const label = planLabel(opts.plan);
  const innerHtml = `
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#ffffff;font-weight:700;">
      Order confirmed
    </h1>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#9ca3af;">
      Your <strong style="color:#ffffff;">${label}</strong> plan and credits are active.
      Sign in with your email and password to open the dashboard.
    </p>
    <a href="${signInUrl}"
       style="display:inline-block;background:#39FF6A;color:#000000;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;padding:13px 20px;border-radius:10px;">
      Sign in
    </a>
  `;

  try {
    const { error } = await resend.emails.send({
      from: MARKETING_FROM,
      to: opts.to,
      subject: 'Your Prysmor plan is active',
      html: wrapTransactionalHtml(innerHtml),
    });
    if (error) return { ok: false, error: error.message ?? String(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Send failed' };
  }
}

/** Free lead magnet: 100-prompt PDF attached. */
export async function sendPromptPackEmail(opts: {
  to: string;
  pdf: Buffer;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const pricingUrl = `${appBaseUrl()}/#pricing`;
  const innerHtml = `
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#ffffff;font-weight:700;">
      Your Prompt Pack is here
    </h1>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#9ca3af;">
      Attached is the Prysmor Prompt Pack: 100 copy-ready prompts for Relight, Background, and VFX.
      Paste them into the panel after you get a lifetime license.
    </p>
    <a href="${pricingUrl}"
       style="display:inline-block;background:#39FF6A;color:#000000;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;padding:13px 20px;border-radius:10px;">
      Get lifetime access
    </a>
    <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">
      Tip: keep prompts short and specific. One effect per generation works best.
    </p>
  `;

  try {
    const { error } = await resend.emails.send({
      from: MARKETING_FROM,
      to: opts.to,
      subject: 'Your Prysmor Prompt Pack (PDF)',
      html: wrapTransactionalHtml(innerHtml),
      attachments: [
        {
          filename: 'prysmor-prompt-pack.pdf',
          content: opts.pdf,
        },
      ],
    });
    if (error) return { ok: false, error: error.message ?? String(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Send failed' };
  }
}

/** Day-after nudge for Prompt Pack leads. */
export async function sendPromptPackFollowUpEmail(opts: {
  to: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const pricingUrl = `${appBaseUrl()}/#pricing`;
  const innerHtml = `
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#ffffff;font-weight:700;">
      Ready to run those prompts?
    </h1>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#9ca3af;">
      You grabbed the Prompt Pack. Here is one to try first in Premiere or After Effects:
    </p>
    <p style="margin:0 0 18px;padding:12px 14px;background:#0a0a0a;border:1px solid rgba(255,255,255,0.08);border-radius:10px;font-size:13px;line-height:1.5;color:#ffffff;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">
      heavy rain, keep subject dry
    </p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#9ca3af;">
      Lifetime unlocks the Prysmor panel, 200 seconds of AI VFX, and Relight, Background, and VFX modes. Pay once. License never expires.
    </p>
    <a href="${pricingUrl}"
       style="display:inline-block;background:#39FF6A;color:#000000;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;padding:13px 20px;border-radius:10px;">
      Get lifetime access · $49.99
    </a>
    <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">
      7-day refund window if it is not for you.
    </p>
  `;

  try {
    const { error } = await resend.emails.send({
      from: MARKETING_FROM,
      to: opts.to,
      subject: 'Ready to run those prompts in Premiere?',
      html: wrapTransactionalHtml(innerHtml),
    });
    if (error) return { ok: false, error: error.message ?? String(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Send failed' };
  }
}

/** @deprecated Use sendPurchaseMagicEmail */
export const sendPurchaseActivationEmail = sendPurchaseMagicEmail;
