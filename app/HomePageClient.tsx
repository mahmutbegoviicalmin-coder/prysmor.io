"use client";

import { MotionConfig } from "framer-motion";
import HeroSection from "@/components/sections/HeroSection";
import HowItWorks from "@/components/sections/HowItWorks";
import CapabilitiesSection from "@/components/sections/CapabilitiesSection";
import VFXRealitySection from "@/components/sections/VFXRealitySection";
import PricingSection, { type PriceTier } from "@/components/sections/PricingSection";
import FAQ, { type FAQItem } from "@/components/sections/FAQ";
import FinalCTA from "@/components/sections/FinalCTA";

const pricingTiers: PriceTier[] = [
  {
    id: "lifetime",
    name: "Prysmor",
    monthlyPrice: 99,
    compareAtPrice: 199,
    oneTime: true,
    featured: true,
    badge: "Lifetime license",
    generation: {
      monthly: {
        shots: "200 seconds of AI VFX",
        seconds: "Premiere + After Effects included",
      },
    },
    highlights: [
      "Pay once — license never expires",
      "200 seconds of AI VFX included",
      "Relight, Background, and VFX",
      "4K output · macOS & Windows",
      "Buy more credits anytime",
    ],
    cta: "Buy Prysmor",
    ctaHref: "/checkout",
    lsMonthlyUrl:
      "https://vfxpilot1.lemonsqueezy.com/checkout/buy/41852cde-e7c2-45fb-bf7b-bcb952dddab0",
  },
];

const faqItems: FAQItem[] = [
  {
    q: "What exactly is Prysmor?",
    a: "Prysmor is an AI VFX panel for Adobe Premiere Pro and After Effects. Select a clip on your timeline, describe the effect, and the result is placed back on your edit at up to 4K.",
  },
  {
    q: "Which Adobe apps are supported?",
    a: "Prysmor includes panels for both Premiere Pro and After Effects on macOS and Windows. Both panels are included with your lifetime license.",
  },
  {
    q: "How long does a render take?",
    a: "Most effects render in 2–5 minutes depending on clip length and complexity. Progress is shown in the panel while it processes.",
  },
  {
    q: "Do my VFX credits expire?",
    a: "Your lifetime license includes 200 seconds of AI VFX. Credits do not reset monthly — use them anytime, and buy more credit packs when you need them.",
  },
  {
    q: "What if I'm not happy with the result?",
    a: "We offer a 7-day refund window from the date of purchase. If the product does not work as described and our support team cannot resolve the issue, contact support@prysmor.io with your order details.",
  },
  {
    q: "Why is this cheaper than hiring a VFX artist?",
    a: "A single VFX shot from a freelancer often runs $300–1,500 plus days of back-and-forth. Prysmor generates effects inside your timeline at a fraction of that cost.",
  },
];

const JSON_LD_SOFTWARE = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Prysmor",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Windows 10, Windows 11, macOS 12, macOS 13, macOS 14",
  offers: {
    "@type": "Offer",
    price: "99",
    priceCurrency: "USD",
  },
  description:
    "AI VFX panel for Adobe Premiere Pro and After Effects. Select a clip, describe the effect, get a 4K result on your timeline.",
  url: "https://prysmor.io",
  applicationSubCategory: "Video Editing Plugin",
  screenshot: "https://www.prysmor.io/logo/logo-full.png",
};

const JSON_LD_ORG = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Prysmor",
  url: "https://prysmor.io",
  logo: "https://www.prysmor.io/logo/logo-full.png",
  description:
    "Prysmor is an AI VFX panel for Adobe Premiere Pro and After Effects.",
  email: "support@prysmor.io",
  sameAs: ["https://instagram.com/prysmor.ai"],
};

const JSON_LD_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function HomePageClient() {
  return (
    <MotionConfig initial={false}>
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_SOFTWARE) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_ORG) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_FAQ) }}
        />

        <HeroSection />
        <HowItWorks />
        <CapabilitiesSection />
        <VFXRealitySection />

        <PricingSection
          title="One license. Lifetime access."
          subtitle="Pay once for Prysmor — Premiere and After Effects panels included."
          tiers={pricingTiers}
          showToggle={false}
          footerNote="Pay once. License never expires. 7-day refund window."
        />

        <div id="faq">
          <FAQ items={faqItems} />
        </div>

        <FinalCTA />
      </>
    </MotionConfig>
  );
}
