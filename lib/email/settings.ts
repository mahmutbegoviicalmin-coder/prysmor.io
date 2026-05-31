import { db } from '@/lib/firebaseAdmin';
import { DEFAULT_DAILY_MARKETING_CAP, FUNNEL_IDS, type FunnelId } from './constants';

export interface FunnelSettings {
  enabled: boolean;
}

export interface CampaignStepOverride {
  delayDays?: number;
  subject?:   string;
  html?:      string;
}

export interface CampaignOverride {
  name?:        string;
  description?: string;
  steps?:       CampaignStepOverride[];
}

export interface EmailSettings {
  dailyMarketingCap: number;
  funnels: Record<FunnelId, FunnelSettings>;
  campaignOverrides?: Partial<Record<FunnelId, CampaignOverride>>;
  updatedAt?: Date;
}

const DEFAULT_SETTINGS: EmailSettings = {
  dailyMarketingCap: DEFAULT_DAILY_MARKETING_CAP,
  funnels: {
    'unpaid-starter': { enabled: true },
    'starter-pro':    { enabled: true },
  },
};

const SETTINGS_REF = () => db.collection('email_settings').doc('global');

export async function getEmailSettings(): Promise<EmailSettings> {
  const snap = await SETTINGS_REF().get();
  if (!snap.exists) return { ...DEFAULT_SETTINGS };

  const data = snap.data()!;
  const funnels = { ...DEFAULT_SETTINGS.funnels };
  for (const id of FUNNEL_IDS) {
    const raw = (data.funnels as Record<string, FunnelSettings> | undefined)?.[id];
    if (raw) funnels[id] = { enabled: raw.enabled !== false };
  }

  const campaignOverrides = (data.campaignOverrides ?? {}) as Partial<
    Record<FunnelId, CampaignOverride>
  >;

  return {
    dailyMarketingCap:
      typeof data.dailyMarketingCap === 'number' && data.dailyMarketingCap > 0
        ? data.dailyMarketingCap
        : DEFAULT_DAILY_MARKETING_CAP,
    funnels,
    campaignOverrides,
    updatedAt: data.updatedAt instanceof Date ? data.updatedAt : undefined,
  };
}

export async function updateEmailSettings(
  patch: Partial<Pick<EmailSettings, 'dailyMarketingCap'>> & {
    funnels?: Partial<Record<FunnelId, Partial<FunnelSettings>>>;
    campaignOverrides?: Partial<Record<FunnelId, CampaignOverride>>;
  },
): Promise<EmailSettings> {
  const current = await getEmailSettings();
  const funnels = { ...current.funnels };
  if (patch.funnels) {
    for (const id of FUNNEL_IDS) {
      if (patch.funnels[id]) {
        funnels[id] = { ...funnels[id], ...patch.funnels[id] };
      }
    }
  }

  let campaignOverrides = { ...current.campaignOverrides };
  if (patch.campaignOverrides) {
    for (const id of FUNNEL_IDS) {
      if (patch.campaignOverrides[id]) {
        campaignOverrides[id] = {
          ...campaignOverrides[id],
          ...patch.campaignOverrides[id],
        };
      }
    }
  }

  const next: EmailSettings = {
    dailyMarketingCap: patch.dailyMarketingCap ?? current.dailyMarketingCap,
    funnels,
    campaignOverrides,
    updatedAt: new Date(),
  };

  await SETTINGS_REF().set(next, { merge: true });
  return next;
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getDailyMarketingSentCount(): Promise<number> {
  const snap = await db.collection('email_stats').doc(todayKey()).get();
  return typeof snap.data()?.marketingSent === 'number' ? snap.data()!.marketingSent : 0;
}

export async function incrementDailyMarketingSent(): Promise<number> {
  const ref = db.collection('email_stats').doc(todayKey());
  const snap = await ref.get();
  const prev = typeof snap.data()?.marketingSent === 'number' ? snap.data()!.marketingSent : 0;
  const next = prev + 1;
  await ref.set({ marketingSent: next, date: todayKey(), updatedAt: new Date() }, { merge: true });
  return next;
}
