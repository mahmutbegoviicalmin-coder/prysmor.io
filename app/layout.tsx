import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import "./globals.css";
import ConditionalShell from "@/components/site/ConditionalShell";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Prysmor — AI Editing Engines for Modern Creators",
    template: "%s — Prysmor",
  },
  description:
    "Prysmor gives creators an AI-powered VFX engine directly inside Adobe Premiere Pro. Generate cinematic effects in seconds.",
  keywords: ["AI video editing", "VFX generator", "Premiere Pro panel", "VFXPilot", "AI effects"],
  icons: {
    icon: "/logo/logo-icon.png",
    apple: "/logo/logo-icon.png",
  },
  openGraph: {
    title: "Prysmor — AI Editing Engines",
    description: "AI-powered VFX directly inside Adobe Premiere Pro. Generate effects in seconds.",
    type: "website",
    images: [{ url: "/logo/logo-full.png", width: 800, height: 200 }],
  },
};

const clerkAppearance = {
  variables: {
    colorPrimary:         "#A3FF12",
    colorBackground:      "#09090F",
    colorInputBackground: "#111118",
    colorInputText:       "#ffffff",
    colorText:            "#ffffff",
    colorTextSecondary:   "#6B7280",
    colorNeutral:         "#1C1C28",
    colorDanger:          "#F87171",
    colorSuccess:         "#A3FF12",
    borderRadius:         "10px",
    fontFamily:           "'DM Sans', sans-serif",
    fontSize:             "14px",
    spacingUnit:          "16px",
  },
  elements: {
    // Card / modal
    card:
      "!bg-[#09090F] shadow-[0_40px_120px_rgba(0,0,0,0.95)] border !border-white/[0.08] !rounded-[18px]",
    cardBox: "!rounded-[18px]",

    // Header
    headerTitle:    "!text-white !text-[20px] !font-semibold !tracking-tight",
    headerSubtitle: "!text-[#6B7280] !text-[13px]",

    // Social buttons styled via globals.css (white bg so Apple/FB/Google all visible)

    // Divider
    dividerLine:   "!bg-white/[0.07]",
    dividerText:   "!text-[#4B5563] !text-[11px] !uppercase !tracking-wider",

    // Input fields
    formFieldLabel:   "!text-[#9CA3AF] !text-[12px] !font-medium",
    formFieldInput:
      "!bg-[#111118] !border !border-white/[0.10] focus:!border-[#A3FF12]/50 !text-white !rounded-[9px] !h-[44px]",
    formFieldInputShowPasswordButton: "!text-[#6B7280] hover:!text-white",

    // Primary action button
    formButtonPrimary:
      "!bg-[#A3FF12] !text-[#050505] hover:!bg-[#B6FF3C] !font-bold !rounded-[9px] !h-[44px] !text-[14px] !transition-all",

    // Links
    formResendCodeLink:        "!text-[#A3FF12] hover:!text-[#B6FF3C]",
    identityPreviewEditButton: "!text-[#A3FF12] hover:!text-[#B6FF3C]",
    footerActionLink:          "!text-[#A3FF12] hover:!text-[#B6FF3C]",

    // Footer
    footer:           "!border-t !border-white/[0.05] !bg-[#09090F]",
    footerActionText: "!text-[#6B7280] !text-[12px]",
    footerPages:      "!hidden",

    // Internal badge
    badge: "!bg-[#A3FF12]/10 !text-[#A3FF12] !border !border-[#A3FF12]/20",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="en" className={`${bricolage.variable} ${dmSans.variable}`}>
        <body className="bg-background text-ink antialiased">
          <ConditionalShell>{children}</ConditionalShell>
          <Script src="https://assets.lemonsqueezy.com/lemon.js" strategy="afterInteractive" />
        </body>
      </html>
    </ClerkProvider>
  );
}
