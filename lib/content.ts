export interface ShowcaseItem {
  id: string;
  title: string;
  description: string;
  gradient: string;
}

export interface PricingTier {
  id: string;
  name: string;
  price: number;
  period: string;
  highlighted: boolean;
  badge?: string;
  unit?: string;
  bullets: string[];
  cta: string;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface Step {
  number: string;
  title: string;
  description: string;
}

export const steps: Step[] = [
  {
    number: "01",
    title: "Select a clip",
    description:
      "Choose any footage from your Premiere timeline — one click links it to Prysmor.",
  },
  {
    number: "02",
    title: "Describe the effect",
    description:
      "Type what you want. Cinematic grade, energy aura, smoke burst — plain language works.",
  },
  {
    number: "03",
    title: "Generate & apply",
    description:
      "Prysmor generates the effect and applies it directly inside your panel. No export required.",
  },
];

export const showcaseItems: ShowcaseItem[] = [
  {
    id: "cinematic-grade",
    title: "Cinematic Grade",
    description: "Deep shadows and lifted mids for a film-ready look.",
    gradient: "from-[#0d1117] via-[#111820] to-[#0a0d12]",
  },
  {
    id: "halation-glow",
    title: "Halation Glow",
    description: "Controlled color halation — presence without the gimmick.",
    gradient: "from-[#0f1a14] via-[#0d1f17] to-[#080f0d]",
  },
  {
    id: "smoke-burst",
    title: "Smoke Burst",
    description: "Volumetric smoke overlay from a single text prompt.",
    gradient: "from-[#141414] via-[#1a1a1a] to-[#0d0d0d]",
  },
  {
    id: "energy-aura",
    title: "Energy Aura",
    description: "Subtle luminance field that wraps subjects with presence.",
    gradient: "from-[#0d1420] via-[#0f1a24] to-[#070d14]",
  },
  {
    id: "light-shift",
    title: "Light Shift",
    description: "Dynamic light leak overlays timed to the cut.",
    gradient: "from-[#1a1208] via-[#1f1810] to-[#0d0d07]",
  },
  {
    id: "stylized-scene",
    title: "Stylized Scene",
    description: "Full scene re-grade from a single artistic direction prompt.",
    gradient: "from-[#0a1a14] via-[#0d1f18] to-[#080f0c]",
  },
];

export const pricingTiers: PricingTier[] = [
  {
    id: "starter",
    name: "Starter",
    price: 29,
    period: "/mo",
    highlighted: false,
    unit: "250s of AI VFX ≈ 4 min",
    bullets: [
      "250 seconds of AI VFX/month",
      "All effect categories",
      "ProRes 4444 alpha export",
      "Premiere & After Effects plugin",
      "1080p output",
    ],
    cta: "Get Started",
  },
  {
    id: "pro",
    name: "Pro",
    price: 49,
    period: "/mo",
    highlighted: true,
    badge: "Most Popular",
    unit: "500s of AI VFX ≈ 8 min",
    bullets: [
      "500 seconds of AI VFX/month",
      "All effect categories",
      "ProRes 4444 alpha export",
      "Premiere & After Effects plugin",
      "4K output quality",
      "Priority render queue",
    ],
    cta: "Get Started",
  },
  {
    id: "exclusive",
    name: "Exclusive",
    price: 129,
    period: "/mo",
    highlighted: false,
    unit: "1000s of AI VFX ≈ 17 min",
    bullets: [
      "1,000 seconds of AI VFX/month",
      "All effect categories",
      "ProRes 4444 alpha export",
      "Premiere & After Effects plugin",
      "4K output quality",
      "Priority support included",
    ],
    cta: "Get Started",
  },
];

export const faqItems: FAQItem[] = [
  {
    id: "what-is-prysmor",
    question: "What is Prysmor?",
    answer:
      "Prysmor is an AI-powered creative tool that generates cinematic video effects and VFXPilot overlays. It works directly inside Adobe Premiere Pro via a native panel, so your workflow stays inside your NLE.",
  },
  {
    id: "need-premiere",
    question: "Do I need Premiere Pro?",
    answer:
      "Yes. The Prysmor panel runs inside Adobe Premiere Pro (CC 2022 and later). Standalone web export is on the roadmap.",
  },
  {
    id: "panel-login",
    question: "How does the panel login work?",
    answer:
      "After installing the panel, click Sign In — it opens a browser window to authenticate with your Prysmor account. Your plan syncs automatically and only the tools you've unlocked will appear.",
  },
  {
    id: "what-files",
    question: "What files do I get?",
    answer:
      "Exports include alpha-channel MOV overlays (ProRes 4444) and optionally flat MP4s for web use. All assets are commercial-ready.",
  },
  {
    id: "cancel",
    question: "Can I cancel anytime?",
    answer:
      "Yes. Cancel from your account dashboard at any time. Access continues until the end of your billing period. No questions asked.",
  },
];

