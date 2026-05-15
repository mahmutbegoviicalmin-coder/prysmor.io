'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/track';

export default function PageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    track('page_view', { path: pathname });
  }, [pathname]);

  return null;
}
