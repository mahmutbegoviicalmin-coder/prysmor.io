'use client';

import { useCallback, useState } from 'react';
import type { FunnelId } from '@/lib/email/constants';
import type { FunnelDefinition } from '@/lib/email/funnels';

export interface EmailLog {
  id: string;
  userId: string;
  email: string;
  funnelId: string;
  step: number;
  status: string;
  subject: string;
  error?: string;
  openedAt?: string | null;
  clickedAt?: string | null;
  openCount?: number;
  createdAt: string | null;
}

export interface EmailAdminData {
  settings: {
    dailyMarketingCap: number;
    funnels: Record<FunnelId, { enabled: boolean }>;
  };
  dailySent: number;
  activeEnrollments: number;
  unpaidUsers: number;
  unpaidEligible?: number;
  unpaidInCampaign?: number;
  unpaidPending?: number;
  starterEligible?: number;
  starterInCampaign?: number;
  enrollmentCounts: Record<string, number>;
  campaigns: FunnelDefinition[];
  analytics?: {
    sent: number;
    opened: number;
    clicked: number;
    openRate: number;
  };
  logs: EmailLog[];
}

export function useEmailAdmin() {
  const [data, setData]         = useState<EmailAdminData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<string | null>(null);
  const [running, setRunning]   = useState(false);
  const [starting, setStarting] = useState<FunnelId | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [error, setError]       = useState('');
  const [errorHint, setErrorHint] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setErrorHint('');
    try {
      const res = await fetch('/api/admin/email');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setData(json);
      return json as EmailAdminData;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch('/api/admin/email', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Save failed');
    setData(json);
    return json as EmailAdminData;
  }

  async function postAction(action: 'process-queue' | 'start-campaign', funnelId: FunnelId) {
    if (action === 'start-campaign') setStarting(funnelId);
    else setRunning(true);
    setRunResult(null);
    setError('');
    setErrorHint('');
    try {
      const res = await fetch('/api/admin/email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, funnelId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorHint(json.hint ?? '');
        throw new Error(json.error ?? 'Request failed');
      }
      if (action === 'start-campaign' && json.enroll) {
        const e = json.enroll;
        const q = json.queue;
        setRunResult(
          `Started: enrolled ${e.enrolled}, queue sent ${q.sent}, skipped ${q.skipped}.`,
        );
      } else {
        setRunResult(`Queue: sent ${json.sent}, skipped ${json.skipped}.`);
      }
      await load();
      return json;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      return null;
    } finally {
      setRunning(false);
      setStarting(null);
    }
  }

  return {
    data,
    setData,
    loading,
    saving,
    setSaving,
    running,
    starting,
    runResult,
    setRunResult,
    error,
    setError,
    setErrorHint,
    errorHint,
    load,
    patch,
    postAction,
  };
}
