'use client';

import { Analytics } from '@vercel/analytics/next';

/** Client wrapper so beforeSend is not passed from a Server Component. */
export default function AnalyticsProvider() {
  return (
    <Analytics
      beforeSend={(event) => {
        try {
          const url = new URL(event.url);
          if (url.pathname.startsWith('/auth/magic')) {
            url.search = '';
            return { ...event, url: url.toString() };
          }
        } catch {
          /* keep original */
        }
        return event;
      }}
    />
  );
}
