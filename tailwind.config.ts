import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#070708",
        surface: {
          DEFAULT: "#0F1012",
          1: "#111316",
          2: "#16181D",
          3: "#1C1F26",
        },
        accent: {
          DEFAULT: "#A3FF12",
          glow: "#B7FF3C",
          dim: "rgba(163,255,18,0.12)",
          "glow-subtle": "rgba(183,255,60,0.08)",
        },
        ink: {
          DEFAULT: "#F0F4F8",
          muted: "#8A9BB0",
          subtle: "rgba(240,244,248,0.55)",
          faint: "rgba(240,244,248,0.30)",
        },
        lime: {
          DEFAULT: "#A3FF12",
          glow: "#B7FF3C",
        },
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        heading: ["var(--font-bricolage)", "system-ui", "sans-serif"],
        mono: ["monospace"],
      },
      maxWidth: {
        container: "1260px",
        "container-sm": "900px",
        "container-xs": "680px",
      },
      borderRadius: {
        "2xl": "16px",
        "3xl": "22px",
        card: "18px",
      },
      letterSpacing: {
        tighter: "-0.035em",
        tight: "-0.025em",
        snug: "-0.01em",
        wide: "0.04em",
        widest2: "0.1em",
      },
      boxShadow: {
        "lime-sm": "0 0 16px rgba(163,255,18,0.22)",
        "lime-md": "0 0 32px rgba(163,255,18,0.30)",
        "lime-lg": "0 0 64px rgba(183,255,60,0.20)",
        "card": "0 2px 24px rgba(0,0,0,0.40), inset 0 0 0 1px rgba(255,255,255,0.05)",
        "card-hover": "0 8px 48px rgba(0,0,0,0.60), inset 0 0 0 1px rgba(255,255,255,0.09)",
        "glow-card": "0 0 48px rgba(163,255,18,0.09), 0 8px 48px rgba(0,0,0,0.55)",
      },
      animation: {
        "glow-pulse": "glowPulse 5s ease-in-out infinite",
        "float": "floatY 6s ease-in-out infinite",
        "accordion-down": "accordionDown 0.22s ease-out",
        "accordion-up": "accordionUp 0.22s ease-out",
        "spin-slow": "spin 12s linear infinite",
      },
      keyframes: {
        glowPulse: {
          "0%, 100%": { opacity: "0.20" },
          "50%": { opacity: "0.50" },
        },
        floatY: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        accordionDown: {
          "0%": { height: "0" },
          "100%": { height: "var(--radix-accordion-content-height)" },
        },
        accordionUp: {
          "0%": { height: "var(--radix-accordion-content-height)" },
          "100%": { height: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
