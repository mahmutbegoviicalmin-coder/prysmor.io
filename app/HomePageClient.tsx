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
    id: "starter",
    name: "Starter",
    monthlyPrice: 29.9,
    yearlyPrice: 299,
    yearlyPerDay: "0.99",
    yearlySave: 49,
    generation: {
      monthly: {
        shots: "≈ 20 shots",
        seconds: "90 sec",
      },
      yearly: {
        shots: "≈ 650 shots",
        seconds: "3,000 sec",
      },
    },
    highlights: ["Relight, Background, and VFX", "4K output", "Email support"],
    cta: "Get Started",
    ctaHref: "/checkout?plan=starter",
    lsMonthlyUrl:
      "https://vfxpilot1.lemonsqueezy.com/checkout/buy/c44b1138-5022-4a77-9ffc-f34a141f8999",
    lsYearlyUrl:
      "https://vfxpilot1.lemonsqueezy.com/checkout/buy/ec075c85-1c0b-43f2-a19a-5f92d6b8e652",
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 49.9,
    yearlyPrice: 499,
    yearlyPerDay: "1.66",
    yearlySave: 89,
    featured: true,
    badge: "Most popular",
    generation: {
      monthly: {
        shots: "≈ 50 shots",
        seconds: "200 sec",
      },
      yearly: {
        shots: "≈ 1,300 shots",
        seconds: "6,000 sec",
      },
    },
    highlights: ["Priority render queue", "Reference images", "Faster support"],
    cta: "Get Started",
    ctaHref: "/checkout?plan=pro",
    lsMonthlyUrl:
      "https://vfxpilot1.lemonsqueezy.com/checkout/buy/85a598e3-f100-466b-be78-7d7a90c933ab",
    lsYearlyUrl:
      "https://vfxpilot1.lemonsqueezy.com/checkout/buy/f6e4d82f-75dc-4eaa-897c-981119375475",
  },
  {
    id: "exclusive",
    name: "Exclusive",
    monthlyPrice: 99.9,
    yearlyPrice: 1299,
    yearlyPerDay: "3.33",
    yearlySave: 249,
    generation: {
      monthly: {
        shots: "≈ 120 shots",
        seconds: "500 sec",
      },
      yearly: {
        shots: "≈ 2,600 shots",
        seconds: "12,000 sec",
      },
    },
    highlights: ["Multiple seats", "Dedicated render lane", "Engineering support"],
    cta: "Get Started",
    ctaHref: "/checkout?plan=exclusive",
    lsMonthlyUrl:
      "https://vfxpilot1.lemonsqueezy.com/checkout/buy/717c1894-de84-4710-9936-c53946d4777e",
    lsYearlyUrl:
      "https://vfxpilot1.lemonsqueezy.com/checkout/buy/8a5a6b84-56a9-46e3-a576-5f0b56d502c6",
  },
];

const faqItems: FAQItem[] = [
  {
    q: "What exactly is Prysmor?",
    a: "Prysmor is an AI VFX panel for Adobe Premiere Pro and After Effects. Select a clip on your timeline, describe the effect, and the result is placed back on your edit at up to 4K.",
  },
  {
    q: "Which Adobe apps are supported?",
    a: "Prysmor includes panels for both Premiere Pro and After Effects on macOS and Windows. Both panels are included in every plan.",
  },
  {
    q: "How long does a render take?",
    a: "Most effects render in 2–5 minutes depending on clip length and complexity. Progress is shown in the panel while it processes.",
  },
  {
    q: "Do my VFX credits expire?",
    a: "Credits reset on your monthly billing date and do not roll over. Each plan includes a set number of seconds per cycle. Shot counts on the pricing page are estimates based on typical 4 to 6 second generations.",
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
    "@type": "AggregateOffer",
    lowPrice: "29.90",
    highPrice: "99.90",
    priceCurrency: "USD",
    offerCount: "3",
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
          title="Plans for every editing workflow."
          tiers={pricingTiers}
          showToggle
          footerNote="Cancel anytime."
        />

        <div id="faq">
          <FAQ items={faqItems} />
        </div>

        <FinalCTA />
      </>
    </MotionConfig>
  );
}
