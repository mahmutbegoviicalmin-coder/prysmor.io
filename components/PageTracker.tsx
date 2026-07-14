'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackPageView } from '@/lib/pixel';

/**
 * Dual-tracks PageView: browser Pixel + Conversions API (same event_id).
 * Fixes Meta "Pixel events covered by CAPI" coverage for PageView.
 */
export default function PageTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastKey = useRef<string>('');

  useEffect(() => {
    const key = `${pathname}?${searchParams?.toString() ?? ''}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    // Wait a tick so fbq is ready after layout script
    const t = window.setTimeout(() => {
      trackPageView();
    }, 50);
    return () => window.clearTimeout(t);
  }, [pathname, searchParams]);

  return null;
}
