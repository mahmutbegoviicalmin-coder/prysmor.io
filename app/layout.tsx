import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-outfit",
});
import Script from "next/script";
import "./globals.css";
import ConditionalShell from "@/components/site/ConditionalShell";

export const metadata: Metadata = {
  title: {
    default: "Prysmor — AI VFX for Adobe Premiere Pro",
    template: "%s — Prysmor",
  },
  description:
    "Generate professional VFX from a text prompt, directly inside Adobe Premiere Pro. No After Effects. No VFX artists.",
  keywords: ["AI VFX", "Premiere Pro plugin", "AI video effects", "Prysmor", "text to VFX"],
  icons: {
    icon: "/logo/logo-icon.png",
    apple: "/logo/logo-icon.png",
  },
  openGraph: {
    title: "Prysmor — AI VFX for Premiere Pro",
    description: "Generate professional VFX from a text prompt, directly inside Adobe Premiere Pro.",
    type: "website",
    images: [{ url: "/logo/logo-full.png", width: 800, height: 200 }],
  },
};

const clerkAppearance = {
  variables: {
    colorPrimary:         "#39FF6A",
    colorBackground:      "#0c0c0c",
    colorInputBackground: "#141414",
    colorInputText:       "#ffffff",
    colorText:            "#ffffff",
    colorTextSecondary:   "#666666",
    colorNeutral:         "#ffffff",
    colorDanger:          "#F87171",
    colorSuccess:         "#39FF6A",
    borderRadius:         "8px",
    fontFamily:           "var(--font-outfit), system-ui, sans-serif",
    fontSize:             "14px",
  },
  elements: {
    card: {
      background:   "#0c0c0c",
      border:       "1px solid #1e1e1e",
      boxShadow:    "none",
      borderRadius: "16px",
    },
    headerTitle: {
      fontSize:      "20px",
      fontWeight:    "700",
      color:         "#ffffff",
      letterSpacing: "-0.5px",
    },
    headerSubtitle: {
      color:    "#444",
      fontSize: "13px",
    },
    socialButtonsBlockButton: {
      background:   "#141414",
      border:       "1px solid #1e1e1e",
      color:        "#888",
      borderRadius: "8px",
      fontSize:     "13px",
      transition:   "all 200ms",
    },
    dividerLine: {
      background: "#1a1a1a",
    },
    dividerText: {
      color:    "#333",
      fontSize: "11px",
    },
    formFieldLabel: {
      color:          "#555",
      fontSize:       "12px",
      fontWeight:     "500",
      textTransform:  "uppercase",
      letterSpacing:  "1px",
    },
    formFieldInput: {
      background:   "#111",
      border:       "1px solid #1e1e1e",
      borderRadius: "8px",
      color:        "#ffffff",
      fontSize:     "14px",
    },
    formButtonPrimary: {
      background:    "#39FF6A",
      color:         "#000000",
      fontWeight:    "700",
      fontSize:      "13px",
      letterSpacing: "0.5px",
      borderRadius:  "8px",
      textTransform: "uppercase",
    },
    footerActionLink: {
      color: "#39FF6A",
    },
    identityPreviewText: {
      color: "#888",
    },
    badge: {
      display: "none",
    },
    // keep these working from previous config
    formFieldInputShowPasswordButton: "!text-[#666] hover:!text-white",
    formResendCodeLink:               "!text-[#39FF6A] hover:!text-[#4fff7e]",
    identityPreviewEditButton:        "!text-[#39FF6A] hover:!text-[#4fff7e]",
    footer:                           "!border-t !border-[#111] !bg-[#0c0c0c]",
    footerActionText:                 "!text-[#444] !text-[12px]",
    footerPages:                      "!hidden",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      afterSignInUrl="/dashboard"
      afterSignUpUrl="/dashboard"
      appearance={clerkAppearance}
    >
      <html lang="en" className={outfit.variable}>
        <body className="bg-background text-ink antialiased">
          <ConditionalShell>{children}</ConditionalShell>
          <Script src="https://assets.lemonsqueezy.com/lemon.js" strategy="afterInteractive" />
        </body>
      </html>
    </ClerkProvider>
  );
}
