import type { FunnelId } from './constants';

export interface FunnelStep {
  delayDays: number;
  subject: string;
  /** HTML body (inner content, wrapper added on send) */
  html: string;
}

export interface FunnelDefinition {
  id: FunnelId;
  name: string;
  description: string;
  steps: FunnelStep[];
}

const PRICING = 'https://prysmor.io/pricing';
const DASHBOARD = 'https://prysmor.io/dashboard';

export const FUNNEL_DEFINITIONS: Record<FunnelId, FunnelDefinition> = {
  'unpaid-starter': {
    id: 'unpaid-starter',
    name: 'Unpaid → Starter',
    description: 'Signups without an active subscription, drive first purchase.',
    steps: [
      {
        delayDays: 0,
        subject: 'Welcome to Prysmor, your AI VFX panel',
        html: `
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d1d5db;">
            Hi {{firstName}},
          </p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d1d5db;">
            You just created a Prysmor account. VFXPilot lets you generate professional effects inside Premiere Pro and After Effects, describe what you want, and AI does the rest.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#d1d5db;">
            Background swaps, relighting, and VFX overlays, without leaving your timeline.
          </p>
          <p style="margin:0 0 24px;">
            <a href="${PRICING}" style="display:inline-block;background:#39FF6A;color:#000;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
              View plans
            </a>
          </p>
        `,
      },
      {
        delayDays: 2,
        subject: 'Finish your first VFX in under 5 minutes',
        html: `
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d1d5db;">
            Hi {{firstName}},
          </p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d1d5db;">
            Most editors waste hours on stock overlays and manual compositing. With Prysmor you select a clip, type a prompt, and get a result back on your timeline.
          </p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d1d5db;">
            Starter includes enough monthly credits for real project work, not just a demo.
          </p>
          <p style="margin:0 0 24px;">
            <a href="${PRICING}" style="display:inline-block;background:#39FF6A;color:#000;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
              Get Starter
            </a>
          </p>
        `,
      },
      {
        delayDays: 5,
        subject: 'Still on the fence? 7-day money-back guarantee',
        html: `
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d1d5db;">
            Hi {{firstName}},
          </p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d1d5db;">
            Try Prysmor risk-free. If it is not the right fit, email us within 7 days of purchase for a full refund.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#d1d5db;">
            Activate your license, install the panel, and ship your next edit faster.
          </p>
          <p style="margin:0 0 24px;">
            <a href="${PRICING}" style="display:inline-block;background:#39FF6A;color:#000;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
              Start now
            </a>
          </p>
        `,
      },
    ],
  },
  'starter-pro': {
    id: 'starter-pro',
    name: 'Starter → Pro',
    description: 'Active Starter subscribers, upsell to Pro for more credits.',
    steps: [
      {
        delayDays: 14,
        subject: 'Need more VFX credits? Pro doubles your allowance',
        html: `
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d1d5db;">
            Hi {{firstName}},
          </p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d1d5db;">
            You are on Starter. Pro unlocks significantly more monthly credits and priority generation, built for editors who run VFX on every project.
          </p>
          <p style="margin:0 0 24px;">
            <a href="${DASHBOARD}/billing" style="display:inline-block;background:#39FF6A;color:#000;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
              Upgrade to Pro
            </a>
          </p>
        `,
      },
      {
        delayDays: 30,
        subject: 'Creators on Pro ship edits 2× faster',
        html: `
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d1d5db;">
            Hi {{firstName}},
          </p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d1d5db;">
            Running out of credits mid-project slows everything down. Pro keeps you in flow with a larger monthly pool and room for longer clips.
          </p>
          <p style="margin:0 0 24px;">
            <a href="${DASHBOARD}/billing" style="display:inline-block;background:#39FF6A;color:#000;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
              See Pro plan
            </a>
          </p>
        `,
      },
    ],
  },
};

export function getFunnel(id: FunnelId): FunnelDefinition {
  return FUNNEL_DEFINITIONS[id];
}

export function renderStepHtml(
  step: FunnelStep,
  vars: { firstName: string; unsubscribeUrl: string },
): { subject: string; html: string } {
  const replace = (s: string) =>
    s
      .replace(/\{\{firstName\}\}/g, vars.firstName)
      .replace(/\{\{unsubscribeUrl\}\}/g, vars.unsubscribeUrl);

  return {
    subject: replace(step.subject),
    html: replace(step.html),
  };
}
