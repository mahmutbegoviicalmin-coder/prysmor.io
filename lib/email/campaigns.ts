import type { FunnelId } from './constants';
import { FUNNEL_IDS } from './constants';
import { FUNNEL_DEFINITIONS, type FunnelDefinition } from './funnels';
import { getEmailSettings, type CampaignOverride } from './settings';

export async function getMergedFunnel(id: FunnelId): Promise<FunnelDefinition> {
  const base = FUNNEL_DEFINITIONS[id];
  const settings = await getEmailSettings();
  const over: CampaignOverride | undefined = settings.campaignOverrides?.[id];

  if (!over) {
    return {
      ...base,
      steps: base.steps.map((s) => ({ ...s })),
    };
  }

  return {
    id:          base.id,
    name:        over.name ?? base.name,
    description: over.description ?? base.description,
    steps: base.steps.map((step, i) => {
      const patch = over.steps?.[i];
      if (!patch) return { ...step };
      return {
        delayDays: patch.delayDays ?? step.delayDays,
        subject:   patch.subject ?? step.subject,
        html:      patch.html ?? step.html,
      };
    }),
  };
}

export async function getAllCampaigns(): Promise<FunnelDefinition[]> {
  return Promise.all(FUNNEL_IDS.map((id) => getMergedFunnel(id)));
}
