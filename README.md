# Prysmor

Cinematic AI video effects + VFXPilot panel for Adobe Premiere Pro.

## Setup

### Prerequisites

- Node.js 18+ (installed automatically if using the setup guide below)
- npm 9+

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
prysmor.io/
├── app/
│   ├── layout.tsx          # Root layout (fonts, metadata, Header/Footer)
│   ├── page.tsx            # Homepage (all sections)
│   ├── pricing/page.tsx    # Pricing page
│   ├── dashboard/page.tsx  # Dashboard placeholder
│   └── docs/install/page.tsx  # Panel install guide
├── components/
│   ├── layout/
│   │   ├── Header.tsx      # Sticky header with blur scroll
│   │   └── Footer.tsx      # Minimal footer
│   ├── sections/
│   │   ├── Hero.tsx        # Above-fold hero with DemoFrame
│   │   ├── ValueStrip.tsx  # 3-metric social proof strip
│   │   ├── HowItWorks.tsx  # 3-step cards
│   │   ├── Showcase.tsx    # 6-effect gallery grid
│   │   ├── PremierePanel.tsx  # Panel mock + feature list
│   │   ├── Pricing.tsx     # 3-tier pricing cards
│   │   ├── InstallCTA.tsx  # Install call-to-action block
│   │   ├── FAQ.tsx         # Accordion FAQ
│   │   └── FinalCTA.tsx    # Bottom CTA
│   └── ui/
│       ├── Button.tsx      # primary / secondary / ghost
│       ├── Badge.tsx       # Pill badge
│       ├── Card.tsx        # Glass card with optional hover
│       ├── Accordion.tsx   # Animated accordion
│       └── Container.tsx   # Max-width wrapper
├── lib/
│   ├── content.ts          # All typed content (showcase, pricing, FAQ)
│   ├── classNames.ts       # cn() utility
│   └── scrollToId.ts       # Smooth scroll helper
└── tailwind.config.ts      # Extended theme (colors, fonts, animations)
```

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Framer Motion** (subtle fade/slide animations)
- **next/font** (Sora + Inter from Google Fonts)

## Pages

| Route | Description |
|-------|-------------|
| `/` | Full marketing homepage |
| `/pricing` | Pricing page (reuses Pricing section) |
| `/dashboard` | Placeholder — "Dashboard coming soon" |
| `/docs/install` | Panel installation guide (Windows + macOS) |

