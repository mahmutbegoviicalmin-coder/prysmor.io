"use client";

import { useRef, useEffect, useState, Fragment } from "react";
import { useClerk } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { ArrowRight, Film, Wand2, Download } from "lucide-react";
import FeatureGrid, { type FeatureItem } from "@/components/sections/FeatureGrid";
import HowItWorks, { type Step } from "@/components/sections/HowItWorks";
import Comparison, { type ComparisonRow } from "@/components/sections/Comparison";
import PricingSection, { type PriceTier } from "@/components/sections/PricingSection";
import Testimonials, { type Testimonial } from "@/components/sections/Testimonials";
import FAQ, { type FAQItem } from "@/components/sections/FAQ";
import FinalCTA from "@/components/sections/FinalCTA";
import VideoCard from "@/components/sections/VideoCard";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const fadeUp = {
  initial:   { opacity: 0, y: 20 },
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

/* ── Examples grid ──────────────────────────────────────────────────────────── */
const vfxExamples = [
  { src: "/editovani/1.mp4",   prompt: "add cinematic neon club lighting",        label: "Relight"    },
  { src: "/editovani/1_1.mp4", prompt: "add dramatic volumetric god rays",         label: "Atmosphere" },
  { src: "/editovani/1_3.mp4", prompt: "surround with fire and embers",            label: "VFX"        },
  { src: "/editovani/1_5.mp4", prompt: "replace sky with galaxy and full moon",    label: "Background" },
];

function ExamplesGrid() {
  return (
    <section
      id="examples"
      style={{
        background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(57,255,106,0.03) 0%, transparent 60%), #070707",
        borderTop: "1px solid #111",
        padding: "100px 20px",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          style={{ marginBottom: "56px" }}
        >
          <p style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "3px",
            color: "#39FF6A",
            marginBottom: "20px",
          }}>
            // REAL OUTPUTS
          </p>
          <h2 style={{
            fontSize: "clamp(28px, 4vw, 48px)",
            fontWeight: 800,
            color: "white",
            letterSpacing: "-1.5px",
            lineHeight: 1.08,
            marginBottom: "14px",
          }}>
            Prompt in. Cinematic shot out.
          </h2>
          <p style={{ fontSize: "15px", color: "#555", lineHeight: 1.6, maxWidth: "480px" }}>
            Four examples created from simple prompts, rendered back to the Premiere timeline in minutes.
          </p>
        </motion.div>

        {/* 2×2 grid */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2"
          style={{ gap: "16px" }}
        >
          {vfxExamples.map((ex, i) => (
            <VideoCard
              key={ex.src}
              src={ex.src}
              prompt={ex.prompt}
              label={ex.label}
              index={i}
            />
          ))}
        </div>

      </div>
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
              initial={{ opacity: 0, y: 14 }}
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
const steps: Step[] = [
  {
    icon: Film,
    number: "01",
    title: "Send a clip to the panel.",
    desc: "Select any clip from your Premiere timeline and open the Prysmor panel. One click.",
  },
  {
    icon: Wand2,
    number: "02",
    title: "Type your prompt. Drop a reference.",
    desc: "Describe the effect in plain language. Optionally attach a reference image for more control.",
  },
  {
    icon: Download,
    number: "03",
    title: "Generate. Import. Done.",
    desc: "Your effect renders in 2–5 minutes and drops directly onto your timeline. No export, no round-tripping.",
  },
];

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
  { badge: "Saves 10+ hours a week", quote: "I knocked out a full music video in one afternoon. Typed the effect, hit generate, done. The fire looked so real my client assumed I had a whole VFX team behind me.", name: "Marcus W.", role: "Music Video Director" },
  { badge: "Cut VFX time by 90%", quote: "No exporting, no round trips, no wasted time. It lives right inside Premiere and behaves exactly how you want it to. That alone made it worth it.", name: "Jordan Park", role: "Motion Designer" },
  { badge: "ROI on first project", quote: "Replaced the background on 40 clips in a single sitting. What used to take me two days of green screen cleanup now takes under an hour and honestly looks better.", name: "Dre Santos", role: "Filmmaker" },
  { badge: "Uses it daily", quote: "I was skeptical going in. The god rays result genuinely surprised me. What I would have built manually in three hours inside After Effects was ready in four minutes.", name: "Leah Torres", role: "VFX Artist" },
  { badge: "Grew channel 3x", quote: "My montages look like a completely different show now. I add cinematic atmosphere in minutes and my audience genuinely thinks I brought on someone new.", name: "Tyson Blake", role: "Gaming Creator" },
  { badge: "Raised freelance rates", quote: "As a solo editor I could never touch proper VFX work. Now I offer it as a service. My rates went up and clients actually pay them. That says everything.", name: "Mia Chen", role: "Freelance Video Editor" },
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
function MobileFloatingCTA() {
  const [visible, setVisible]   = useState(false);
  const [magX, setMagX]         = useState(0);
  const [magY, setMagY]         = useState(0);
  const [pressed, setPressed]   = useState(false);
  const btnRef                  = useRef<HTMLButtonElement>(null);
  const reducedMotion           = useRef(
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 250);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (reducedMotion.current) return;
    const rect = btnRef.current!.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width  / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    setMagX(dx * 6);
    setMagY(dy * 4);
  };

  const handlePointerLeave = () => {
    setMagX(0);
    setMagY(0);
    setPressed(false);
  };

  const handleClick = () => {
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
  };

  const scale = pressed ? 0.97 : 1;

  return (
    <div
      aria-hidden={!visible}
      className="mobile-floating-cta"
      style={{
        position: "fixed",
        right: "16px",
        bottom: "calc(16px + env(safe-area-inset-bottom))",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 300ms ease",
        zIndex: 999,
      }}
    >
      <button
        ref={btnRef}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          height: "40px",
          padding: "0 16px",
          borderRadius: "20px",
          background: "rgba(18,18,18,0.75)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          color: "rgba(255,255,255,0.82)",
          fontSize: "13px",
          fontWeight: 500,
          border: "1px solid rgba(255,255,255,0.09)",
          cursor: "pointer",
          letterSpacing: "0px",
          boxShadow: pressed
            ? "0 2px 8px rgba(0,0,0,0.3)"
            : "0 4px 16px rgba(0,0,0,0.35)",
          transform: `translate3d(${magX}px, ${magY}px, 0) scale(${scale})`,
          transition: pressed
            ? "transform 80ms ease, box-shadow 80ms ease"
            : "transform 320ms cubic-bezier(0.22,1,0.36,1), box-shadow 320ms ease",
          willChange: "transform",
          userSelect: "none",
          WebkitUserSelect: "none",
          touchAction: "manipulation",
        }}
        onMouseEnter={(e) => {
          if (reducedMotion.current) return;
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = "rgba(57,255,106,0.25)";
          el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(57,255,106,0.08)";
          el.style.transform = `translate3d(${magX}px,${magY}px,0) translateY(-2px) scale(1.02)`;
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = "rgba(255,255,255,0.09)";
          el.style.boxShadow = "0 4px 16px rgba(0,0,0,0.35)";
          el.style.transform = `translate3d(${magX}px,${magY}px,0) scale(1)`;
        }}
      >
        <span style={{
          width: "5px", height: "5px", borderRadius: "50%",
          background: "#39FF6A",
          flexShrink: 0,
        }} />
        Generate VFX →
      </button>
    </div>
  );
}

export default function PrysmorPage() {
  const { openSignUp } = useClerk();

  return (
    <>
      <MobileFloatingCTA />
      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden flex flex-col items-center"
        style={{
          minHeight: "95vh",
          paddingTop: "clamp(100px, 16vh, 160px)",
          paddingBottom: "80px",
          paddingLeft: "20px",
          paddingRight: "20px",
          background: "#070707",
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
          background: "radial-gradient(ellipse at center, rgba(30,80,40,0.35) 0%, rgba(10,30,15,0.15) 45%, transparent 70%)",
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
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut", delay: 0.1 }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "20px",
              padding: "5px 16px 5px 12px",
              marginBottom: "40px",
            }}
          >
            <span style={{
              fontSize: "11px",
              fontWeight: 400,
              color: "rgba(255,255,255,0.38)",
              letterSpacing: "0.2px",
            }}>
              Now available in Premiere Pro
            </span>
          </motion.div>

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, ease: [0.22,1,0.36,1], delay: 0.2 }}
            style={{ width: "100%", maxWidth: "720px" }}
          >
            {/* Line 1 */}
            <div style={{
              fontSize: "clamp(28px, 4.2vw, 54px)",
              fontWeight: 700,
              letterSpacing: "-1.5px",
              lineHeight: 1.08,
              whiteSpace: "nowrap",
            }}>
              <span style={{ color: "#ffffff" }}>VFX that used to take </span>
              <span style={{ color: "rgba(255,255,255,0.42)" }}>hours.</span>
            </div>

            {/* Line 2 */}
            <div style={{
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
            </div>
          </motion.div>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.36 }}
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
            From prompt to timeline. Fully automated.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: "easeOut", delay: 0.5 }}
            className="flex items-center justify-center flex-wrap"
            style={{ gap: "12px", marginTop: "44px" }}
          >
            {/* Primary */}
            <button
              onClick={() => openSignUp({ afterSignUpUrl: "/dashboard" })}
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
          </motion.div>

          {/* Stats — purely typographic, no icons */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: "easeOut", delay: 0.66 }}
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
          </motion.div>

        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────── */}
      <HowItWorks title="How Prysmor works" steps={steps} />

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
        onPrimaryClick={() => openSignUp({ afterSignUpUrl: "/dashboard" })}
      />
    </>
  );
}
