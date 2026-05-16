"use client";

import { useRef, useEffect, useState, Fragment } from "react";
import { useClerk } from "@clerk/nextjs";
import { motion, MotionConfig } from "framer-motion";
import { ArrowRight, Sparkles, Clock, Wand2 } from "lucide-react";
import { track } from "@/lib/track";
import FeatureGrid, { type FeatureItem } from "@/components/sections/FeatureGrid";
import Comparison, { type ComparisonRow } from "@/components/sections/Comparison";
import PricingSection, { type PriceTier } from "@/components/sections/PricingSection";
import Testimonials, { type Testimonial } from "@/components/sections/Testimonials";
import FAQ, { type FAQItem } from "@/components/sections/FAQ";
import FinalCTA from "@/components/sections/FinalCTA";
import BeforeAfterSlider from "@/components/sections/BeforeAfterSlider";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const fadeUp = {
  initial:   { opacity: 1, y: 0 },
  whileInView: { opacity: 1, y: 0 },
  viewport:  { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease },
};

/* ── Panel mockup ─────────────────────────────────────────────────────────── */
function PanelMockup() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { videoRef.current?.play().catch(() => {}); }, []);

  return (
    <div
      className="rounded-[20px] overflow-hidden border border-white/[0.08] bg-[#0a0a0a]"
      style={{ boxShadow: "0 40px 100px rgba(0,0,0,0.70)" }}
    >
      {/* Chrome */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#080808]">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#2a2a2a]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#2a2a2a]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#2a2a2a]" />
        </div>
        <span className="text-[11px] text-white/20 font-mono flex-1 text-center select-none">
          Prysmor · Adobe Premiere Pro
        </span>
      </div>

      {/* Video */}
      <div className="aspect-[16/10] bg-[#060606] relative overflow-hidden">
        {!loaded && <div className="absolute inset-0 bg-[#0a0a0a]" />}
        <video
          ref={videoRef}
          src="/editovani/1.mp4"
          loop muted playsInline preload="auto"
          onCanPlay={() => setLoaded(true)}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", opacity: loaded ? 1 : 0, transition: "opacity 0.4s",
          }}
        />
        <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-[6px] border border-white/10 bg-black/60 backdrop-blur-sm px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#39FF6A]" />
          <span className="text-[10px] text-white/60 font-medium">AI Generated</span>
        </div>
      </div>

      {/* Timeline strip */}
      <div className="px-4 py-3 border-t border-white/[0.06] bg-[#080808]">
        <div className="flex items-end gap-[3px] h-8">
          {Array.from({ length: 28 }).map((_, i) => {
            const isClip = i >= 5 && i <= 12;
            const isResult = i >= 14 && i <= 18;
            return (
              <div key={i} className="flex-1 rounded-[2px]"
                style={{
                  height: isClip || isResult ? "100%" : `${44 + (i % 4) * 14}%`,
                  background: isResult ? "rgba(57,255,106,0.30)" : isClip ? "#1e1e1e" : "#181818",
                  border: isResult ? "1px solid rgba(57,255,106,0.50)" : "none",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Prompt */}
      <div className="p-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 bg-[#111111] border border-white/[0.08] rounded-[12px] px-4 py-2.5">
          <span className="text-[12px] font-mono text-white/35 flex-1 truncate">
            &ldquo;add cinematic neon club lighting&rdquo;
          </span>
          <span className="flex-shrink-0 text-[11px] font-bold bg-[#39FF6A] text-black rounded-[100px] px-4 py-1.5">
            Generate
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Examples bento grid ─────────────────────────────────────────────────────── */
const EXAMPLE_CATEGORIES = [
  {
    name: "Relight",
    color: "rgba(255,190,90,0.8)",
    videos: [
      "/primjeri/re1.mp4",
      "/primjeri/re2.mp4",
    ],
  },
  {
    name: "Background",
    color: "rgba(90,170,255,0.8)",
    videos: [
      "/primjeri/bg1.mp4",
      "/primjeri/bg2.mp4",
      "/primjeri/stock.mp4",
    ],
  },
  {
    name: "VFX",
    color: "rgba(57,255,106,0.8)",
    videos: [
      "/primjeri/vfx1.mp4",
      "/primjeri/vfx2.mp4",
    ],
  },
];

function CategoryVideoCard({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    const el = wrapRef.current;
    if (!v || !el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="eg-card-inner" style={{
      position: "relative", width: "100%", height: "100%",
      overflow: "hidden", background: "#0a0a0a", borderRadius: "10px",
    }}>
      <video
        ref={videoRef}
        src={src}
        muted loop playsInline preload="metadata"
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", display: "block",
          transition: "transform 800ms cubic-bezier(0.22,1,0.36,1)",
          willChange: "transform",
        }}
      />
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)",
      }} />
    </div>
  );
}

function ExamplesGrid() {
  return (
    <section id="examples" style={{ background: "#080808", borderTop: "1px solid #111" }}>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 clamp(16px,4vw,32px)" }}>

        {/* Header */}
        <div className="anim-fade-up" style={{ padding: "80px 0 56px" }}>
          <p style={{
            fontSize: "10px", fontWeight: 500, color: "#39FF6A",
            letterSpacing: "2.5px", textTransform: "uppercase", margin: "0 0 12px",
          }}>// Real outputs</p>
          <h2 style={{
            fontSize: "clamp(24px, 2.8vw, 40px)", fontWeight: 700,
            color: "white", letterSpacing: "-1.4px", lineHeight: 1.08, margin: 0,
          }}>
            Prompt in.<br />Cinematic shot out.
          </h2>
        </div>

        {/* Category rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: "48px", paddingBottom: "80px" }}>
          {EXAMPLE_CATEGORIES.map((cat, ci) => (
            <motion.div
              key={cat.name}
              initial={{ opacity: 1, y: 0 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: ci * 0.08 }}
            >
              {/* Category label row */}
              <div style={{
                display: "flex", alignItems: "center", gap: "14px",
                marginBottom: "14px",
              }}>
                <span style={{
                  fontSize: "10px", fontWeight: 600, letterSpacing: "2.5px",
                  textTransform: "uppercase", color: cat.color,
                  fontFamily: "ui-monospace,SFMono-Regular,monospace",
                }}>
                  {cat.name}
                </span>
                <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.06)" }} />
                <span style={{
                  fontSize: "10px", color: "#333",
                  fontFamily: "ui-monospace,SFMono-Regular,monospace",
                }}>
                  {cat.videos.length} clips
                </span>
              </div>

              {/* Video row */}
              <div className={`eg-row eg-row-${cat.videos.length}`}>
                {cat.videos.map((src, vi) => (
                  <div key={vi} className="eg-cell">
                    <CategoryVideoCard src={src} />
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <style>{`
        .eg-card-inner:hover video { transform: scale(1.04); }

        /* ── Desktop ── */
        .eg-row { display: grid; gap: 8px; }

        /* 2-video row (Relight, VFX) — first card wider */
        .eg-row-2 { grid-template-columns: 3fr 2fr; }
        .eg-row-2 .eg-cell { height: 300px; }

        /* 3-video row (Background) — equal thirds */
        .eg-row-3 { grid-template-columns: repeat(3, 1fr); }
        .eg-row-3 .eg-cell { height: 220px; }

        /* ── Tablet ── */
        @media (max-width: 768px) {
          .eg-row-2 { grid-template-columns: 1fr 1fr; }
          .eg-row-2 .eg-cell { height: 220px; }
          .eg-row-3 { grid-template-columns: 1fr 1fr; }
          .eg-row-3 .eg-cell { height: 180px; }
          .eg-row-3 .eg-cell:last-child { grid-column: span 2; }
        }

        /* ── Mobile ── */
        @media (max-width: 480px) {
          .eg-row-2,
          .eg-row-3 { grid-template-columns: 1fr; gap: 4px; }
          .eg-row-2 .eg-cell,
          .eg-row-3 .eg-cell { height: 190px; }
          .eg-row-3 .eg-cell:last-child { grid-column: 1; }
        }
      `}</style>
    </section>
  );
}

/* ── Modes section ──────────────────────────────────────────────────────────── */
const MODES = [
  {
    badge: "RELIGHT",
    title: "Change the light. Change the mood.",
    desc: "Relight any scene with a single sentence. No color wheels, no keyframes.",
    prompt: "warm backlight, late afternoon haze",
  },
  {
    badge: "STYLE",
    title: "Film look in one prompt.",
    desc: "Cinematic grades, texture overlays, and visual treatments. Applied in minutes.",
    prompt: "35mm grain, cool shadows, lifted blacks",
  },
  {
    badge: "VFX",
    title: "Add, remove, transform.",
    desc: "Generate rain, fire, smoke. Remove objects. Add props. All from text.",
    prompt: "heavy rain, remove the boom mic on left",
  },
  {
    badge: "AUTO",
    title: "Just describe the shot.",
    desc: "Not sure which mode? Type freely. Prysmor picks the right workflow automatically.",
    prompt: "make it feel like a Tokyo music video",
  },
];

const GREEN = "#39FF6A";

function ModesSection() {
  return (
    <section className="relative py-24" id="features" style={{ borderTop: "1px solid #111" }}>
      <div className="mx-auto px-4 sm:px-6 lg:px-8" style={{ maxWidth: "860px" }}>

        {/* Heading */}
        <motion.div {...fadeUp} style={{ marginBottom: "56px" }}>
          <p style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "3px",
            color: GREEN,
            marginBottom: "20px",
          }}>
            // FOUR MODES
          </p>
          <h2 style={{
            fontSize: "clamp(32px, 4vw, 48px)",
            fontWeight: 800,
            color: "white",
            letterSpacing: "-1.5px",
            lineHeight: 1.08,
            marginBottom: "16px",
          }}>
            Four modes.<br />Built for the work.
          </h2>
          <p style={{ fontSize: "15px", color: "#555", lineHeight: 1.6, maxWidth: "460px" }}>
            Pick one or leave it on Auto. Prysmor reads your prompt and routes it.
          </p>
        </motion.div>

        {/* Rows */}
        <div>
          {MODES.map((m, i) => (
            <motion.div
              key={m.badge}
              initial={{ opacity: 1, y: 0 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.07, ease }}
              className="modes-row"
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr 280px",
                alignItems: "center",
                gap: "32px",
                padding: "32px 0",
                borderBottom: "1px solid #111",
                borderTop: i === 0 ? "1px solid #111" : "none",
                cursor: "default",
                transition: "background 200ms",
                borderRadius: "4px",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.01)";
                const badge = e.currentTarget.querySelector(".mode-badge") as HTMLElement | null;
                if (badge) {
                  badge.style.borderColor = GREEN;
                  badge.style.color = GREEN;
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                const badge = e.currentTarget.querySelector(".mode-badge") as HTMLElement | null;
                if (badge) {
                  badge.style.borderColor = "#222";
                  badge.style.color = "#555";
                }
              }}
            >
              {/* LEFT — badge */}
              <div>
                <span
                  className="mode-badge"
                  style={{
                    display: "inline-block",
                    background: "transparent",
                    border: "1px solid #222",
                    color: "#555",
                    fontSize: "11px",
                    fontWeight: 500,
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    padding: "4px 12px",
                    borderRadius: "4px",
                    transition: "border-color 200ms, color 200ms",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.badge}
                </span>
              </div>

              {/* MIDDLE — title + description */}
              <div>
                <h3 style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "white",
                  letterSpacing: "-0.3px",
                  marginBottom: "6px",
                  lineHeight: 1.3,
                }}>
                  {m.title}
                </h3>
                <p style={{
                  fontSize: "13px",
                  color: "#555",
                  fontWeight: 300,
                  lineHeight: 1.6,
                  maxWidth: "400px",
                  margin: 0,
                }}>
                  {m.desc}
                </p>
              </div>

              {/* RIGHT — prompt example */}
              <div style={{
                background: "#0d0d0d",
                border: "1px solid #161616",
                borderRadius: "6px",
                padding: "12px 16px",
                fontFamily: "monospace",
                fontSize: "12px",
                color: "#444",
                textAlign: "left",
                width: "100%",
              }}>
                &ldquo;{m.prompt}&rdquo;
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}

/* ── Data ───────────────────────────────────────────────────────────────────── */
const compRows: ComparisonRow[] = [
  { feature: "Cost", ours: "from $29.90/month", theirs: "$500–2,000/project" },
  { feature: "Time per effect", ours: "2–5 minutes", theirs: "1–3 days" },
  { feature: "Learning curve", ours: "None", theirs: "6+ months" },
  { feature: "Works in your editor", ours: true, theirs: false },
  { feature: "Unlimited revisions", ours: true, theirs: "Costs extra" },
  { feature: "AI-powered generation", ours: true, theirs: false },
];

const pricingTiers: PriceTier[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 29.90,
    yearlyPrice: 299,
    yearlyPerDay: "0.99",
    yearlySave: 49,
    description: "For editors running 1–2 projects a month",
    unit: "90s of AI VFX ≈ 1.5 min",
    yearlyUnit: "3000s of AI VFX ≈ 48 min",
    bullets: ["Premiere Pro panel", "All four VFX modes", "4K output", "7-day guarantee"],
    cta: "Get Started",
    ctaHref: "/checkout?plan=starter",
    lsMonthlyUrl: "https://vfxpilot1.lemonsqueezy.com/checkout/buy/c44b1138-5022-4a77-9ffc-f34a141f8999",
    lsYearlyUrl:  "https://vfxpilot1.lemonsqueezy.com/checkout/buy/ec075c85-1c0b-43f2-a19a-5f92d6b8e652",
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 49.90,
    yearlyPrice: 499,
    yearlyPerDay: "1.66",
    yearlySave: 89,
    description: "For active editors shipping weekly",
    unit: "200s of AI VFX ≈ 3 min",
    yearlyUnit: "6000s of AI VFX ≈ 98 min",
    featured: true,
    badge: "Most Popular",
    bullets: ["Everything in Starter", "Priority render queue", "Reference image support", "Faster support response", "Early access to new modes"],
    cta: "Get Started",
    ctaHref: "/checkout?plan=pro",
    lsMonthlyUrl: "https://vfxpilot1.lemonsqueezy.com/checkout/buy/85a598e3-f100-466b-be78-7d7a90c933ab",
    lsYearlyUrl:  "https://vfxpilot1.lemonsqueezy.com/checkout/buy/f6e4d82f-75dc-4eaa-897c-981119375475",
  },
  {
    id: "exclusive",
    name: "Exclusive",
    monthlyPrice: 99.90,
    yearlyPrice: 1299,
    yearlyPerDay: "3.33",
    yearlySave: 249,
    description: "For studios and production teams",
    unit: "500s of AI VFX ≈ 8 min",
    yearlyUnit: "12000s of AI VFX ≈ 204 min",
    bullets: ["Everything in Pro", "Multiple seats", "Dedicated render lane", "Direct line to engineering", "Onboarding call"],
    cta: "Get Started",
    ctaHref: "/checkout?plan=exclusive",
    lsMonthlyUrl: "https://vfxpilot1.lemonsqueezy.com/checkout/buy/717c1894-de84-4710-9936-c53946d4777e",
    lsYearlyUrl:  "https://vfxpilot1.lemonsqueezy.com/checkout/buy/8a5a6b84-56a9-46e3-a576-5f0b56d502c6",
  },
];

const testimonials: Testimonial[] = [
  {
    badge: "bro it actually works",
    quote: "client wanted a fire effect on a deadline. used to be a whole After Effects project. prysmor did it in like 4 minutes. sent the file same day. dude thought i had a team. i'm literally a one-man show out of my bedroom.",
    name: "Jake R.",
    role: "Freelance Video Editor, 23",
  },
  {
    badge: "charging more now",
    quote: "i was doing edits for $300 flat. added VFX as a service after prysmor. now i charge $900 minimum and nobody argues because the results are actually insane. best investment i made this year no question.",
    name: "Tyler M.",
    role: "Content Creator, 22",
  },
  {
    badge: "ok i wasn't expecting this",
    quote: "been editing since i was 15 so i was like this is probably gonna be trash. first render had me genuinely staring at my screen. my reels went from 40k avg to like 180k after i started adding proper effects. that's not a coincidence.",
    name: "Luca S.",
    role: "Instagram / YouTube, 18",
  },
  {
    badge: "actually replaced my AE workflow",
    quote: "3 years doing motion design so i know what VFX should look like. skeptical going in. the god rays held up at 4K. atmospheric stuff, lens flares, light leaks — all clean. my turnaround went from 3 days to same day on most jobs.",
    name: "Noah K.",
    role: "Motion Designer, 24",
  },
  {
    badge: "my editor friends keep asking",
    quote: "dropped a music video last month and my whole comment section was asking who did the VFX. i typed like 6 words into prysmor. literally described the vibe and it matched. i don't even know how to explain it without sounding like an ad.",
    name: "Marco A.",
    role: "Music Video Director, 22",
  },
  {
    badge: "40 clips in one afternoon",
    quote: "had a brand shoot with like 40 clips that all needed the same atmospheric treatment. two days minimum normally. i did the whole thing in an afternoon. client asked if i brought in extra help. nope, just me and this tool.",
    name: "Ethan V.",
    role: "Brand Video Editor, 23",
  },
];

const faqItems: FAQItem[] = [
  { q: "What exactly is Prysmor?", a: "Prysmor is an Adobe Premiere Pro plugin that generates professional VFX from a text prompt. Select a clip, describe the effect, and the result lands back on your timeline at 4K. No After Effects, no freelancer needed." },
  { q: "How long does a render take?", a: "Most effects render in 2–5 minutes depending on clip length and complexity. You'll see a progress indicator in the panel while it processes." },
  { q: "Do my VFX credits expire?", a: "Credits reset on your monthly billing date and don't roll over. We size the plans to match real editing workflows. Most users don't hit the limit." },
  { q: "What if I'm not happy with the result?", a: "7-day money-back guarantee, no questions asked. If your first three shots don't change how you work, email us and we'll refund the full amount." },
  { q: "Is it worth it if I only edit occasionally?", a: "The Starter plan at $29.90/month covers 1–2 projects comfortably. Cancel anytime. There's no annual lock-in on monthly billing." },
  { q: "Which software does Prysmor support?", a: "Prysmor works natively inside Adobe Premiere Pro on both macOS and Windows. After Effects support is on the roadmap." },
  { q: "Why is this cheaper than hiring a VFX artist?", a: "A single VFX shot from a freelancer runs $300–1,500 plus days of back-and-forth. Prysmor automates the generation at a fraction of that cost. And it stays inside your timeline." },
];

const heroStats = [
  { value: "12,000+", label: "VFX Shots Generated"   },
  { value: "3 min",   label: "Avg Render Time"        },
  { value: "7-day",   label: "Money Back Guarantee"   },
];

const PARTICLES = [
  { x: 8,  y: 22, dur: 9,  del: 0,   op: 0.18 },
  { x: 19, y: 68, dur: 11, del: 2.1, op: 0.14 },
  { x: 77, y: 15, dur: 8,  del: 1.4, op: 0.16 },
  { x: 85, y: 55, dur: 10, del: 0.7, op: 0.12 },
  { x: 92, y: 80, dur: 12, del: 3.0, op: 0.15 },
  { x: 4,  y: 85, dur: 9,  del: 1.8, op: 0.13 },
  { x: 62, y: 6,  dur: 11, del: 0.4, op: 0.17 },
  { x: 45, y: 92, dur: 8,  del: 2.5, op: 0.12 },
];

/* ── Page ─────────────────────────────────────────────────────────────────── */
/* ── Exit intent popup ──────────────────────────────────────────────────────── */
function ExitIntentPopup() {
  const [open, setOpen]       = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    // Desktop only — mobile has no mouse leave toward top
    if (window.innerWidth < 768) return;
    try { if (sessionStorage.getItem("prysmor_exit_seen")) return; } catch { /* private mode */ }

    function onMouseLeave(e: MouseEvent) {
      if (e.clientY <= 8) {
        setOpen(true);
        requestAnimationFrame(() => setMounted(true));
        try { sessionStorage.setItem("prysmor_exit_seen", "1"); } catch { /* private mode */ }
        document.removeEventListener("mouseleave", onMouseLeave);
      }
    }
    document.addEventListener("mouseleave", onMouseLeave);
    return () => document.removeEventListener("mouseleave", onMouseLeave);
  }, []);

  function close() {
    setMounted(false);
    setTimeout(() => setOpen(false), 340);
  }

  function copy() {
    navigator.clipboard.writeText("WELCOME20").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={close} style={{
        position: "fixed", inset: 0, zIndex: 1050,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        opacity: mounted ? 1 : 0,
        transition: "opacity 340ms ease",
      }} />

      {/* Card */}
      <div style={{
        position: "fixed", zIndex: 1051,
        top: "50%", left: "50%",
        width: "min(500px, calc(100vw - 24px))",
        background: "#0d0d0d",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "24px",
        overflow: "hidden",
        boxShadow: "0 40px 100px rgba(0,0,0,0.8)",
        opacity: mounted ? 1 : 0,
        transform: mounted
          ? "translate(-50%, -50%) scale(1)"
          : "translate(-50%, calc(-50% + 28px)) scale(0.95)",
        transition: "opacity 380ms cubic-bezier(0.22,1,0.36,1), transform 380ms cubic-bezier(0.22,1,0.36,1)",
      }}>
        {/* Header strip */}
        <div style={{
          background: "linear-gradient(135deg, #0c1a0c 0%, #111 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          padding: "32px 32px 28px",
          position: "relative",
        }}>
          {/* Glow */}
          <div aria-hidden style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse 70% 90% at 50% 130%, rgba(57,255,106,0.1) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          <p style={{
            fontSize: "10px", fontWeight: 600, color: "#39FF6A",
            letterSpacing: "2.5px", textTransform: "uppercase",
            margin: "0 0 12px",
          }}>
            Wait — before you go
          </p>
          <h2 style={{
            fontSize: "clamp(22px, 4vw, 30px)",
            fontWeight: 700, color: "white",
            letterSpacing: "-1px", lineHeight: 1.15, margin: 0,
          }}>
            Here&apos;s 20% off,<br />on us.
          </h2>
        </div>

        {/* Close */}
        <button
          onClick={close}
          style={{
            position: "absolute", top: "14px", right: "14px",
            width: "30px", height: "30px", borderRadius: "50%",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.3)", fontSize: "13px",
            cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center",
            transition: "background 150ms",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
          aria-label="Close"
        >
          ✕
        </button>

        <div style={{ padding: "28px 32px 28px" }}>
          <p style={{
            fontSize: "13px", color: "#444", lineHeight: 1.65,
            margin: "0 0 22px",
          }}>
            Generate cinematic VFX directly inside Premiere Pro. Use this code at checkout — no expiry.
          </p>

          {/* Code */}
          <button
            onClick={copy}
            style={{
              width: "100%", display: "flex",
              alignItems: "center", justifyContent: "space-between",
              background: "#141414",
              border: `1px solid ${copied ? "rgba(57,255,106,0.45)" : "rgba(57,255,106,0.15)"}`,
              borderRadius: "12px", padding: "14px 18px",
              cursor: "pointer", marginBottom: "14px",
              transition: "border-color 200ms",
            }}
          >
            <span style={{
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: "18px", fontWeight: 700,
              color: "white", letterSpacing: "4px",
            }}>
              WELCOME20
            </span>
            <span style={{
              fontSize: "11px", fontWeight: 600,
              color: copied ? "#39FF6A" : "#3a3a3a",
              letterSpacing: "0.5px",
              transition: "color 200ms",
              whiteSpace: "nowrap",
            }}>
              {copied ? "Copied ✓" : "Tap to copy"}
            </span>
          </button>

          {/* CTA */}
          <button
            onClick={() => {
              close();
              setTimeout(() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" }), 320);
            }}
            style={{
              width: "100%", height: "50px", borderRadius: "12px",
              background: "#39FF6A", color: "#000",
              fontSize: "14px", fontWeight: 700, border: "none",
              cursor: "pointer", letterSpacing: "-0.2px",
              boxShadow: "0 4px 24px rgba(57,255,106,0.2)",
              transition: "background 150ms, transform 120ms",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#4fff7e"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#39FF6A"; }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.98)"; }}
            onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
          >
            Claim discount →
          </button>

          <p style={{
            fontSize: "11px", color: "#252525",
            textAlign: "center", margin: "12px 0 0",
          }}>
            Cancel anytime · Works on all plans
          </p>
        </div>
      </div>
    </>
  );
}

/* ── Floating CTA — bottom right ───────────────────────────────────────────── */
function FloatingCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.6);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{
        position: "fixed",
        bottom: "calc(24px + env(safe-area-inset-bottom))",
        right: "clamp(12px, 3vw, 24px)",
        zIndex: 998,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 420ms ease, transform 420ms cubic-bezier(0.22,1,0.36,1)",
      }}>
        <button
          onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
          onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.96)"; }}
          onPointerUp={(e)   => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
          onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0",
            borderRadius: "14px",
            background: "rgba(10,10,10,0.92)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(57,255,106,0.2)",
            cursor: "pointer",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(57,255,106,0.06) inset",
            transition: "transform 130ms ease, border-color 200ms ease, box-shadow 200ms ease",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = "rgba(57,255,106,0.4)";
            el.style.boxShadow = "0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(57,255,106,0.08)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = "rgba(57,255,106,0.2)";
            el.style.boxShadow = "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(57,255,106,0.06) inset";
          }}
        >
          {/* Icon block */}
          <span style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "44px", height: "48px",
            borderRight: "1px solid rgba(255,255,255,0.05)",
            flexShrink: 0,
          }}>
            <Wand2 size={15} color="#39FF6A" strokeWidth={2} />
          </span>

          {/* Text */}
          <span style={{
            display: "flex", flexDirection: "column", alignItems: "flex-start",
            padding: "0 14px 0 12px",
          }}>
            <span style={{
              fontSize: "12px", fontWeight: 700, color: "white",
              letterSpacing: "-0.1px", lineHeight: 1.3,
            }}>
              Generate VFX
            </span>
            <span style={{
              fontSize: "10px", fontWeight: 400,
              color: "rgba(255,255,255,0.28)",
              lineHeight: 1.3,
            }}>
              Premiere Pro
            </span>
          </span>

          {/* Arrow pill */}
          <span style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "32px", height: "48px",
            borderLeft: "1px solid rgba(255,255,255,0.05)",
            flexShrink: 0,
          }}>
            <ArrowRight size={13} color="#39FF6A" strokeWidth={2.2} />
          </span>
        </button>
      </div>
  );
}

/* ── Welcome discount popup ─────────────────────────────────────────────────── */
const DISCOUNT_CODE = "WELCOME20";

function WelcomePopup() {
  const [open, setOpen]       = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied]   = useState(false);
  const [secs, setSecs]       = useState(10 * 60);

  useEffect(() => {
    try { if (sessionStorage.getItem("prysmor_welcome_seen")) return; } catch { /* private mode */ }
    const onScroll = () => {
      const pct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      if (pct >= 0.20) {
        setOpen(true);
        requestAnimationFrame(() => setMounted(true));
        try { sessionStorage.setItem("prysmor_welcome_seen", "1"); } catch { /* private mode */ }
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [open]);

  function close() {
    setMounted(false);
    setTimeout(() => setOpen(false), 350);
  }

  function copy() {
    navigator.clipboard.writeText(DISCOUNT_CODE).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const urgent = secs < 120;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          opacity: mounted ? 1 : 0,
          transition: "opacity 350ms ease",
        }}
      />

      {/* Card */}
      <div style={{
        position: "fixed", zIndex: 1001,
        top: "50%", left: "50%",
        width: "min(460px, calc(100vw - 24px))",
        background: "#0d0d0d",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "24px",
        overflow: "hidden",
        boxShadow: "0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03)",
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translate(-50%, -50%) scale(1)" : "translate(-50%, calc(-50% + 24px)) scale(0.96)",
        transition: "opacity 380ms cubic-bezier(0.22,1,0.36,1), transform 380ms cubic-bezier(0.22,1,0.36,1)",
      }}>

        {/* Top image area — dark gradient banner */}
        <div style={{
          height: "110px",
          background: "linear-gradient(135deg, #0a1a0a 0%, #111 50%, #0d0d0d 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", overflow: "hidden",
        }}>
          {/* Radial glow */}
          <div aria-hidden style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse 60% 80% at 50% 120%, rgba(57,255,106,0.12) 0%, transparent 70%)",
          }} />
          {/* Big discount text */}
          <div style={{ position: "relative", textAlign: "center" }}>
            <p style={{
              fontSize: "52px", fontWeight: 800, color: "white",
              letterSpacing: "-3px", lineHeight: 1, margin: 0,
            }}>
              20<span style={{ color: "#39FF6A" }}>%</span>
            </p>
            <p style={{
              fontSize: "11px", fontWeight: 500, color: "rgba(255,255,255,0.3)",
              letterSpacing: "2px", textTransform: "uppercase", margin: "4px 0 0",
            }}>
              off your first plan
            </p>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={close}
          style={{
            position: "absolute", top: "14px", right: "14px",
            width: "30px", height: "30px", borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.35)", fontSize: "13px",
            cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center",
            lineHeight: 1, transition: "background 150ms ease",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
          aria-label="Close"
        >
          ✕
        </button>

        <div style={{ padding: "28px 28px 24px" }}>

          {/* Headline */}
          <h3 style={{
            fontSize: "18px", fontWeight: 700, color: "white",
            letterSpacing: "-0.5px", lineHeight: 1.3,
            margin: "0 0 6px",
          }}>
            Welcome to Prysmor.
          </h3>
          <p style={{
            fontSize: "13px", color: "#444", lineHeight: 1.6,
            margin: "0 0 24px",
          }}>
            Use the code below at checkout — this offer expires soon.
          </p>

          {/* Code box */}
          <button
            onClick={copy}
            style={{
              width: "100%", display: "flex",
              alignItems: "center", justifyContent: "space-between",
              background: "#141414",
              border: `1px solid ${copied ? "rgba(57,255,106,0.5)" : "rgba(57,255,106,0.15)"}`,
              borderRadius: "12px", padding: "14px 18px",
              cursor: "pointer", marginBottom: "14px",
              transition: "border-color 200ms ease",
            }}
          >
            <span style={{
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: "18px", fontWeight: 700,
              color: "white", letterSpacing: "4px",
            }}>
              {DISCOUNT_CODE}
            </span>
            <span style={{
              fontSize: "11px", fontWeight: 600, letterSpacing: "0.5px",
              color: copied ? "#39FF6A" : "#3a3a3a",
              transition: "color 200ms ease",
              whiteSpace: "nowrap",
            }}>
              {copied ? "Copied ✓" : "Tap to copy"}
            </span>
          </button>

          {/* Timer row */}
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            marginBottom: "20px",
            padding: "10px 14px",
            background: urgent ? "rgba(255,80,80,0.05)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${urgent ? "rgba(255,80,80,0.12)" : "rgba(255,255,255,0.05)"}`,
            borderRadius: "8px",
            transition: "all 500ms ease",
          }}>
            <Clock size={13} color={urgent ? "#ff6b6b" : "#444"} />
            <span style={{
              fontSize: "12px", color: urgent ? "#ff6b6b" : "#555",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              transition: "color 500ms ease",
            }}>
              Offer expires in{" "}
              <span style={{ fontWeight: 700, color: urgent ? "#ff6b6b" : "rgba(255,255,255,0.7)" }}>
                {mm}:{ss}
              </span>
            </span>
          </div>

          {/* CTA */}
          <button
            onClick={() => {
              close();
              setTimeout(() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" }), 300);
            }}
            style={{
              width: "100%", height: "50px", borderRadius: "12px",
              background: "#39FF6A", color: "#000",
              fontSize: "14px", fontWeight: 700, border: "none",
              cursor: "pointer", letterSpacing: "-0.2px",
              boxShadow: "0 4px 24px rgba(57,255,106,0.2)",
              transition: "background 150ms ease, transform 120ms ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#4fff7e"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#39FF6A"; }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.98)"; }}
            onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
          >
            Claim 20% discount →
          </button>

          <p style={{
            fontSize: "11px", color: "#2e2e2e",
            textAlign: "center", margin: "12px 0 0",
          }}>
            Cancel anytime · No credit card required
          </p>
        </div>
      </div>
    </>
  );
}

const JSON_LD_SOFTWARE = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Prysmor",
  "applicationCategory": "MultimediaApplication",
  "operatingSystem": "Windows 10, Windows 11, macOS 12, macOS 13, macOS 14",
  "offers": { "@type": "AggregateOffer", "lowPrice": "29.90", "highPrice": "99.90", "priceCurrency": "USD", "offerCount": "3" },
  "description": "Generate professional VFX from a text prompt, directly inside Adobe Premiere Pro. No After Effects. No VFX artists.",
  "url": "https://prysmor.io",
  "applicationSubCategory": "Video Editing Plugin",
  "screenshot": "https://www.prysmor.io/logo/logo-full.png",
};

const JSON_LD_ORG = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Prysmor",
  "url": "https://prysmor.io",
  "logo": "https://www.prysmor.io/logo/logo-full.png",
  "description": "Prysmor makes AI-powered VFX generation accessible to every video editor through a native Adobe Premiere Pro plugin.",
  "email": "support@prysmor.io",
  "sameAs": ["https://instagram.com/prysmor.ai"],
};

const JSON_LD_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question", "name": "What exactly is Prysmor?", "acceptedAnswer": { "@type": "Answer", "text": "Prysmor is an Adobe Premiere Pro plugin that generates professional VFX from a text prompt. Select a clip, describe the effect, and the result lands back on your timeline at 4K. No After Effects, no freelancer needed." } },
    { "@type": "Question", "name": "How long does a render take?", "acceptedAnswer": { "@type": "Answer", "text": "Most effects render in 2–5 minutes depending on clip length and complexity. You'll see a progress indicator in the panel while it processes." } },
    { "@type": "Question", "name": "Do my VFX credits expire?", "acceptedAnswer": { "@type": "Answer", "text": "Credits reset on your monthly billing date and don't roll over. We size the plans to match real editing workflows. Most users don't hit the limit." } },
    { "@type": "Question", "name": "What if I'm not happy with the result?", "acceptedAnswer": { "@type": "Answer", "text": "7-day money-back guarantee, no questions asked. If your first three shots don't change how you work, email us and we'll refund the full amount." } },
    { "@type": "Question", "name": "Which software does Prysmor support?", "acceptedAnswer": { "@type": "Answer", "text": "Prysmor works natively inside Adobe Premiere Pro on both macOS and Windows. After Effects support is on the roadmap." } },
    { "@type": "Question", "name": "Why is this cheaper than hiring a VFX artist?", "acceptedAnswer": { "@type": "Answer", "text": "A single VFX shot from a freelancer runs $300–1,500 plus days of back-and-forth. Prysmor automates the generation at a fraction of that cost and stays inside your timeline." } },
  ],
};

export default function PrysmorPage() {
  const { openSignUp } = useClerk();

  return (
    <MotionConfig initial={false}>
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_SOFTWARE) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_ORG) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_FAQ) }} />
      <FloatingCTA />
      <WelcomePopup />
      <ExitIntentPopup />
      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden flex flex-col items-center"
        style={{
          minHeight: "95vh",
          paddingTop: "clamp(100px, 16vh, 160px)",
          paddingBottom: "80px",
          paddingLeft: "20px",
          paddingRight: "20px",
          background: "#0c0c0c",
        }}
      >
        {/* Radial glow behind headline */}
        <div aria-hidden="true" style={{
          position: "absolute",
          top: "10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "700px",
          height: "500px",
          background: "radial-gradient(ellipse at center, rgba(30,80,40,0.45) 0%, rgba(10,30,15,0.20) 45%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }} />

        {/* Vignette */}
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
          background: [
            "radial-gradient(ellipse 120% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)",
            "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 30%, transparent 70%, #070707 100%)",
          ].join(", "),
        }} />

        {/* Noise texture */}
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1, opacity: 0.025,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: "180px 180px",
        }} />

        {/* Particles — minimal */}
        {PARTICLES.map((p, i) => (
          <motion.div
            key={i}
            aria-hidden="true"
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: "1.5px",
              height: "1.5px",
              borderRadius: "50%",
              background: `rgba(57,255,106,${p.op})`,
              pointerEvents: "none",
              zIndex: 0,
            }}
            animate={{ y: [0, -14, 0], opacity: [p.op * 0.5, p.op, p.op * 0.5] }}
            transition={{ duration: p.dur, repeat: Infinity, ease: "easeInOut", delay: p.del }}
          />
        ))}

        {/* Content */}
        <div
          className="flex flex-col items-center text-center w-full"
          style={{ position: "relative", zIndex: 10, maxWidth: "760px", margin: "0 auto" }}
        >

          {/* Badge */}
          <div
            className="anim-fade-up"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              background: "rgba(255,255,255,0.03)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: "6px",
              padding: "5px 12px",
              marginBottom: "44px",
              marginTop: "32px",
            }}
          >
            <span style={{
              width: "5px", height: "5px", borderRadius: "50%",
              background: "#39FF6A", flexShrink: 0,
            }} />
            <span style={{
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: "10px", fontWeight: 500,
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "1.5px", textTransform: "uppercase",
            }}>
              Premiere Pro · Native plugin
            </span>
          </div>

          {/* Headline */}
          <h1
            className="anim-fade-up-d1"
            style={{ width: "100%", maxWidth: "720px", margin: 0, padding: 0 }}
          >
            <span style={{
              display: "block",
              fontSize: "clamp(28px, 4.2vw, 54px)",
              fontWeight: 700,
              letterSpacing: "-1.5px",
              lineHeight: 1.08,
              whiteSpace: "nowrap",
            }}>
              <span style={{ color: "#ffffff" }}>VFX that used to take </span>
              <span style={{ color: "rgba(255,255,255,0.42)" }}>hours.</span>
            </span>

            <span style={{
              display: "block",
              fontSize: "clamp(34px, 5.2vw, 66px)",
              fontWeight: 800,
              letterSpacing: "-2px",
              lineHeight: 1.06,
              marginTop: "6px",
              whiteSpace: "nowrap",
            }}>
              <span style={{ color: "#ffffff" }}>Now takes </span>
              <span style={{
                color: "#39FF6A",
                textShadow: "0 0 12px rgba(57,255,106,0.13)",
              }}>
                minutes.
              </span>
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className="anim-fade-up-d2"
            style={{
              fontSize: "clamp(14px, 2vw, 17px)",
              color: "#5a5a5a",
              fontWeight: 300,
              maxWidth: "420px",
              lineHeight: 1.65,
              marginTop: "28px",
              letterSpacing: "0.01em",
            }}
          >
            No After Effects. No VFX artists. No exports. Just type and generate.
          </p>

          {/* CTAs */}
          <div
            className="anim-fade-up-d3 flex items-center justify-center flex-wrap"
            style={{ gap: "12px", marginTop: "44px" }}
          >
            {/* Primary */}
            <button
              onClick={() => { track('cta_click', { location: 'hero_primary' }); openSignUp({ afterSignUpUrl: "/dashboard" }); }}
              className="inline-flex items-center gap-2 cursor-pointer"
              style={{
                background: "linear-gradient(160deg, #44ff74 0%, #29d955 55%, #22c24a 100%)",
                color: "#000",
                borderRadius: "10px",
                padding: "14px 32px",
                fontSize: "15px",
                fontWeight: 700,
                border: "1px solid rgba(57,255,106,0.3)",
                boxShadow: "0 1px 0 rgba(255,255,255,0.25) inset, 0 6px 24px rgba(57,255,106,0.18), 0 2px 8px rgba(0,0,0,0.3)",
                transition: "transform 200ms ease, box-shadow 200ms ease",
                letterSpacing: "-0.2px",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "translateY(-2px)";
                el.style.boxShadow = "0 1px 0 rgba(255,255,255,0.25) inset, 0 10px 32px rgba(57,255,106,0.28), 0 4px 12px rgba(0,0,0,0.35)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "translateY(0)";
                el.style.boxShadow = "0 1px 0 rgba(255,255,255,0.25) inset, 0 6px 24px rgba(57,255,106,0.18), 0 2px 8px rgba(0,0,0,0.3)";
              }}
            >
              Generate VFX <ArrowRight size={15} />
            </button>

            {/* Secondary */}
            <a
              href="#examples"
              onClick={() => track('cta_click', { location: 'hero_demo' })}
              className="inline-flex items-center gap-2"
              style={{
                background: "transparent",
                color: "rgba(255,255,255,0.5)",
                borderRadius: "10px",
                padding: "14px 28px",
                fontSize: "15px",
                fontWeight: 400,
                border: "1px solid rgba(255,255,255,0.08)",
                textDecoration: "none",
                transition: "border-color 200ms, color 200ms",
                letterSpacing: "-0.1px",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = "rgba(255,255,255,0.16)";
                el.style.color = "rgba(255,255,255,0.8)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = "rgba(255,255,255,0.08)";
                el.style.color = "rgba(255,255,255,0.5)";
              }}
            >
              Watch Demo
            </a>
          </div>

          {/* Stats — purely typographic, no icons */}
          <div
            className="anim-fade-up-d4"
            style={{
              marginTop: "64px",
              display: "grid",
              gridTemplateColumns: "1fr 1px 1fr 1px 1fr",
              alignItems: "center",
              width: "100%",
              maxWidth: "480px",
              margin: "64px auto 0",
            }}
          >
            {heroStats.map(({ value, label }, idx) => (
              <Fragment key={value}>
                {idx > 0 && (
                  <div style={{
                    width: "1px",
                    height: "32px",
                    background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.07), transparent)",
                    justifySelf: "center",
                  }} />
                )}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 8px" }}>
                  <span style={{
                    fontSize: "clamp(16px, 4vw, 22px)",
                    fontWeight: 700,
                    color: "white",
                    letterSpacing: "-0.8px",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                  }}>
                    {value}
                  </span>
                  <span style={{
                    fontSize: "clamp(7px, 1.8vw, 9px)",
                    fontWeight: 500,
                    color: "#333",
                    textTransform: "uppercase",
                    letterSpacing: "1.4px",
                    marginTop: "6px",
                    whiteSpace: "nowrap",
                    textAlign: "center",
                  }}>
                    {label}
                  </span>
                </div>
              </Fragment>
            ))}
          </div>

          {/* Scroll indicator */}
          <div
            className="anim-fade-d2"
            style={{
              marginTop: "60px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
            }}
            onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
          >
            <span style={{
              fontSize: "10px",
              fontWeight: 500,
              color: "rgba(255,255,255,0.18)",
              letterSpacing: "2px",
              textTransform: "uppercase",
            }}>
              Scroll
            </span>
            <div style={{
                width: "20px",
                height: "32px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.1)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                paddingTop: "5px",
              }}
            >
              <div style={{
                  width: "3px",
                  height: "6px",
                  borderRadius: "2px",
                  background: "rgba(57,255,106,0.5)",
                }}
              />
            </div>
          </div>

        </div>
      </section>

      {/* ── BEFORE / AFTER ──────────────────────────────────────────── */}
      <section style={{ background: "#080808", padding: "0 24px 100px" }}>
        <motion.div
          initial={{ opacity: 1, y: 0 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.6 }}
          style={{ maxWidth: "960px", margin: "0 auto" }}
        >
          {/* Slider */}
          <BeforeAfterSlider
            beforeSrc="/hero/after.mp4"
            afterSrc="/hero/before.mp4"
            beforeLabel="ORIGINAL"
            afterLabel="PRYSMOR"
            initialPos={48}
          />

          {/* Footer row */}
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            marginTop: "14px", flexWrap: "wrap", gap: "8px",
          }}>
            <span style={{
              fontSize: "11px", color: "#2a2a2a",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}>
              Generated inside Adobe Premiere Pro
            </span>
            <span style={{
              fontSize: "11px", color: "#2a2a2a",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}>
              Render time: ~3 min
            </span>
          </div>
        </motion.div>
      </section>


      {/* ── EXAMPLES ────────────────────────────────────────────────── */}
      <div id="examples">
        <ExamplesGrid />
      </div>

      {/* ── MODES ───────────────────────────────────────────────────── */}
      <ModesSection />

      {/* ── COMPARISON ──────────────────────────────────────────────── */}
      <Comparison
        title="Prysmor vs The Alternatives"
        subtitle="See why creators choose Prysmor over traditional methods."
        ourLabel="Prysmor"
        theirLabel="Hiring VFX Artist"
        rows={compRows}
      />

      {/* ── PRICING ─────────────────────────────────────────────────── */}
      <div id="pricing" />
      <PricingSection
        title="Pick a plan. Start shipping shots."
        subtitle="Same features on every plan. Different amounts of VFX credits."
        tiers={pricingTiers}
        showToggle={true}
        footerNote="7-Day Money-Back Guarantee · Cancel Anytime"
      />

      {/* ── TESTIMONIALS ────────────────────────────────────────────── */}
      <Testimonials
        title="What creators say"
        items={testimonials}
      />

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <div id="faq">
        <FAQ items={faqItems} />
      </div>

      {/* ── FINAL CTA ───────────────────────────────────────────────── */}
      <FinalCTA
        title="Stop hiring VFX artists. Start typing."
        subtitle="Generate cinematic VFX directly inside Adobe Premiere Pro."
        primaryLabel="Get Started"
        onPrimaryClick={() => { track('cta_click', { location: 'bottom_cta' }); openSignUp({ afterSignUpUrl: "/dashboard" }); }}
      />
    </>
    </MotionConfig>
  );
}
