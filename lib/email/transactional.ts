import { Resend } from 'resend';
import { MARKETING_FROM, appBaseUrl } from './constants';
import { PLAN_LABELS } from '@/lib/firestore/users';

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

export async function sendPurchaseActivationEmail(opts: {
  to: string;
  claimId: string;
  plan: string;
  activateUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const activateUrl = opts.activateUrl
    ?? `${appBaseUrl()}/activate?purchase=${encodeURIComponent(opts.claimId)}`;
  const label = planLabel(opts.plan);
  const innerHtml = `
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#ffffff;font-weight:700;">
      Thanks for your order
    </h1>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#9ca3af;">
      Your <strong style="color:#ffffff;">${label}</strong> subscription is ready.
      One quick step left: activate your Prysmor account.
    </p>
    <ol style="margin:0 0 22px;padding-left:18px;color:#9ca3af;font-size:14px;line-height:1.7;">
      <li>Click <strong style="color:#ffffff;">Activate account</strong> below</li>
      <li>Create a password once</li>
      <li>Install the Premiere Pro and After Effects panels</li>
    </ol>
    <a href="${activateUrl}"
       style="display:inline-block;background:#39FF6A;color:#000000;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;padding:13px 20px;border-radius:10px;">
      Activate account
    </a>
  `;

  try {
    const { error } = await resend.emails.send({
      from: MARKETING_FROM,
      to: opts.to,
      subject: 'Thanks for your Prysmor order',
      html: wrapTransactionalHtml(innerHtml),
    });
    if (error) return { ok: false, error: error.message ?? String(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Send failed' };
  }
}

export async function sendOrderConfirmedEmail(opts: {
  to: string;
  plan: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const dashboardUrl = `${appBaseUrl()}/dashboard`;
  const label = planLabel(opts.plan);
  const innerHtml = `
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#ffffff;font-weight:700;">
      Order confirmed
    </h1>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#9ca3af;">
      Your <strong style="color:#ffffff;">${label}</strong> plan and credits are active on your Prysmor account.
    </p>
    <a href="${dashboardUrl}"
       style="display:inline-block;background:#39FF6A;color:#000000;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;padding:13px 20px;border-radius:10px;">
      Open dashboard
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
