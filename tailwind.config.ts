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
        background: "#080808",
        surface: {
          DEFAULT: "#0f0f0f",
          1: "#141414",
          2: "#1a1a1a",
          3: "#202020",
        },
        green: {
          DEFAULT: "#39FF6A",
          muted: "rgba(57,255,106,0.10)",
          dim:   "#2BCC54",
          glow:  "rgba(57,255,106,0.06)",
        },
        bg: {
          primary:   "#080808",
          secondary: "#0f0f0f",
          tertiary:  "#141414",
        },
        accent: {
          DEFAULT:      "#39FF6A",
          glow:         "#39FF6A",
          dim:          "rgba(57,255,106,0.10)",
          "glow-subtle": "rgba(57,255,106,0.05)",
        },
        ink: {
          DEFAULT: "#F0F4F8",
          muted:   "#8A9BB0",
          subtle:  "rgba(240,244,248,0.55)",
          faint:   "rgba(240,244,248,0.30)",
        },
      },
      fontFamily: {
        sans:    ["var(--font-outfit)", "system-ui", "sans-serif"],
        heading: ["var(--font-outfit)", "system-ui", "sans-serif"],
        mono:    ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      maxWidth: {
        container:    "1260px",
        "container-sm": "900px",
        "container-xs": "680px",
      },
      borderRadius: {
        card: "20px",
        pill: "100px",
      },
      letterSpacing: {
        tighter:  "-0.035em",
        tight:    "-0.025em",
        snug:     "-0.01em",
        wide:     "0.04em",
        widest2:  "0.1em",
      },
      boxShadow: {
        card:        "0 2px 20px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.05)",
        "card-hover":"0 8px 36px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.08)",
        panel:       "0 32px 80px rgba(0,0,0,0.65)",
      },
      animation: {
        "ticker":    "ticker 32s linear infinite",
        "ticker-r":  "ticker-r 36s linear infinite",
        "accordion-down": "accordionDown 0.22s ease-out",
        "accordion-up":   "accordionUp 0.22s ease-out",
      },
      keyframes: {
        ticker: {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "ticker-r": {
          "0%":   { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" },
        },
        accordionDown: {
          "0%":   { height: "0" },
          "100%": { height: "var(--radix-accordion-content-height)" },
        },
        accordionUp: {
          "0%":   { height: "var(--radix-accordion-content-height)" },
          "100%": { height: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
