import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

import { Suspense } from "react";
import ConditionalShell from "@/components/site/ConditionalShell";
import PageTracker from "@/components/PageTracker";
import { FB_PIXEL_ID } from "@/lib/pixel";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: {
    default: "Prysmor | AI VFX for Premiere Pro & After Effects",
    template: "%s | Prysmor",
  },
  description:
    "AI VFX panel for Adobe Premiere Pro and After Effects. Select a clip, describe the effect, get a 4K result on your timeline.",
  keywords: ["AI VFX", "Premiere Pro plugin", "AI video effects", "Prysmor", "text to VFX"],
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "Prysmor | AI VFX for Premiere Pro",
    description: "Generate professional VFX from a text prompt, directly inside Adobe Premiere Pro.",
    type: "website",
    images: [{ url: "/logo/logo-full.png", width: 800, height: 200 }],
  },
  verification: {
    google: "Iqoms-_KGTD4UQbvkIvjIXL3d6SZ89pab77TqDvzuCM",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable}>
      <head>
        {/* bfcache fix: force full reload when iOS Safari restores page from back-forward cache */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.addEventListener('pageshow', function(e) {
            if (e.persisted) { window.location.reload(); }
          });
        `}} />
      </head>
      <body className="bg-background text-ink antialiased">
        <Suspense fallback={null}><PageTracker /></Suspense>
        <ConditionalShell>{children}</ConditionalShell>
        <Script src="https://assets.lemonsqueezy.com/lemon.js" strategy="afterInteractive" />
        <Script
          id="fb-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${FB_PIXEL_ID}');
              fbq('track', 'PageView');
            `,
          }}
        />
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
        <Analytics />
      </body>
    </html>
  );
}
