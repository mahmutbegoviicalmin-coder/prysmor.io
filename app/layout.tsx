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
    colorPrimary: "#A3FF12",
    colorBackground: "#08080D",
    colorInputBackground: "#0E0E15",
    colorInputText: "#ffffff",
    colorText: "#ffffff",
    colorTextSecondary: "#8A9BB0",
    colorNeutral: "#1C1C28",
    colorDanger: "#FF5555",
    colorSuccess: "#A3FF12",
    borderRadius: "14px",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "14px",
  },
  elements: {
    card: "shadow-[0_32px_80px_rgba(0,0,0,0.9)] border border-white/[0.08]",
    socialButtonsBlockButton: "border-white/[0.10] hover:bg-white/[0.05]",
    dividerLine: "bg-white/[0.07]",
    formFieldInput: "border-white/[0.10] focus:border-[#A3FF12]/50",
    footer: "hidden",
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
