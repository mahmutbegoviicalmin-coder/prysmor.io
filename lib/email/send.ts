import { Resend } from 'resend';
import { MARKETING_FROM } from './constants';
import { buildUnsubscribeUrl } from './unsubscribe';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export function wrapMarketingHtml(innerHtml: string, unsubscribeUrl: string): string {
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
      You received this because you have a Prysmor account.<br/>
      <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe from product emails</a>
    </p>
  </div>
</body>
</html>`;
}

export interface SendMarketingResult {
  ok: boolean;
  resendId?: string;
  error?: string;
}

export async function sendMarketingEmail(opts: {
  to: string;
  subject: string;
  innerHtml: string;
  userId: string;
}): Promise<SendMarketingResult> {
  if (!resend) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  const unsubscribeUrl = buildUnsubscribeUrl(opts.userId);
  const html = wrapMarketingHtml(opts.innerHtml, unsubscribeUrl);

  try {
    const { data, error } = await resend.emails.send({
      from:    MARKETING_FROM,
      to:      opts.to,
      subject: opts.subject,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
    });

    if (error) {
      return { ok: false, error: error.message ?? String(error) };
    }
    return { ok: true, resendId: data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Send failed' };
  }
}
