export const MARKETING_FROM = 'Prysmor <hello@prysmor.io>';

export const FUNNEL_IDS = ['unpaid-starter', 'starter-pro'] as const;
export type FunnelId = (typeof FUNNEL_IDS)[number];

export const DEFAULT_DAILY_MARKETING_CAP = 40;

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://prysmor.io').replace(/\/$/, '');
}
