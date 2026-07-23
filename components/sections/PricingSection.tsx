"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Check, ShieldCheck, Lock, Monitor } from "lucide-react";
import { initiateCheckout, getMetaClickIds } from "@/lib/pixel";
import { track, trackCta } from "@/lib/track";
import OfferCountdown from "@/components/sections/OfferCountdown";

declare global {
  interface Window {
    LemonSqueezy?: {
      Setup: () => void;
      Url: { Open: (url: string) => void; Close: () => void };
    };
    createLemonSqueezy?: () => void;
  }
}

export interface GenerationAllowance {
  shots: string;
  seconds?: string;
}

export interface PlanFeatureGroup {
  title: string;
  items: string[];
}

export interface PriceTier {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  yearlyPerDay?: string;
  yearlySave?: number;
  /** Shown as strikethrough above the main price (e.g. 199 above 49.99). */
  compareAtPrice?: number;
  /** One-time purchase: hide /mo and billing toggle behavior. */
  oneTime?: boolean;
  /** Free gift / bonus callout shown as a gift strip (not a paid feature). */
  bonus?: string;
  tagline?: string;
  description?: string;
  generation?: {
    monthly: GenerationAllowance;
    yearly?: GenerationAllowance;
  };
  highlights?: string[];
  featureGroups?: PlanFeatureGroup[];
  unit?: string;
  yearlyUnit?: string;
  bullets?: string[];
  featured?: boolean;
  badge?: string;
  cta: string;
  ctaHref: string;
  onCtaClick?: () => void;
  lsMonthlyUrl?: string;
  lsYearlyUrl?: string;
}

interface PricingSectionProps {
  title?: string;
  subtitle?: string;
  tiers: PriceTier[];
  showToggle?: boolean;
  footerNote?: string;
  onCtaClick?: () => void;
}

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const CTA_LABELS: Record<string, string> = {
  lifetime: "Get lifetime access",
  starter: "Get Starter",
  pro: "Get Pro",
  exclusive: "Get Exclusive",
};

const TRUST_ITEMS = [
  { icon: Monitor, label: "macOS and Windows" },
  { icon: Lock, label: "Secure checkout" },
  { icon: ShieldCheck, label: "7-day money-back guarantee" },
];

const EDITOR_AVATARS = [
  { src: "/chris-boustet.jpg", alt: "Chris" },
  { src: "/asim-nauwag.jpg", alt: "Asim" },
  { src: "/suari-mahmed.jpg", alt: "Suari" },
  { src: "/editor-static-1.jpg", alt: "Editor" },
] as const;

function LifetimeSpotsBar({
  claimed,
  limit,
  soldOut,
}: {
  claimed: number;
  limit: number;
  soldOut: boolean;
}) {
  const pct = Math.min(100, Math.round((claimed / Math.max(limit, 1)) * 100));
  return (
    <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-medium text-white/55">
          {soldOut ? "Intro price sold out" : "Lifetime spots at this price"}
        </span>
        <span className={`font-semibold tabular-nums ${soldOut ? "text-white/40" : "text-[#39FF6A]/85"}`}>
          {claimed} / {limit} claimed
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            soldOut ? "bg-white/25" : "bg-[#39FF6A]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SocialProofBar({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center ${
        compact ? "justify-start gap-3" : "flex-col gap-3 sm:flex-row sm:justify-center sm:gap-4"
      }`}
    >
      <div className="flex items-center -space-x-2.5">
        {EDITOR_AVATARS.map((avatar) => (
          <div
            key={avatar.src}
            className={`relative overflow-hidden rounded-full border-2 bg-[#1a1a1a] ${
              compact
                ? "h-8 w-8 border-[#0c0c0c]"
                : "h-9 w-9 border-[#080808]"
            }`}
          >
            <Image
              src={avatar.src}
              alt={avatar.alt}
              width={compact ? 32 : 36}
              height={compact ? 32 : 36}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
      <p
        className={`tracking-[-0.01em] ${
          compact
            ? "text-left text-[12px] text-white/45"
            : "text-center text-[13px] text-white/50"
        }`}
      >
        Trusted by{" "}
        <span className="font-semibold text-white/80">2,000+ editors</span>
      </p>
    </div>
  );
}

const ADOBE_APPS = [
  { src: "/pr.png", name: "Premiere Pro", alt: "Adobe Premiere Pro" },
  { src: "/ae.png", name: "After Effects", alt: "Adobe After Effects" },
] as const;

function fmtPrice(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function resolveHighlights(tier: PriceTier): string[] {
  if (tier.highlights?.length) return tier.highlights;
  if (tier.featureGroups?.length) {
    return tier.featureGroups.flatMap((g) => g.items);
  }
  return tier.bullets ?? [];
}

function legacyGeneration(tier: PriceTier, yearly: boolean): GenerationAllowance | null {
  const raw = yearly && tier.yearlyUnit ? tier.yearlyUnit : tier.unit;
  if (!raw) return null;
  const [secondsPart] = raw.split("≈").map((s) => s.trim());
  return { shots: raw, seconds: secondsPart };
}

function BillingToggle({
  yearly,
  onChange,
}: {
  yearly: boolean;
  onChange: (yearly: boolean) => void;
}) {
  return (
    <div
      className="relative inline-flex rounded-[11px] border border-white/[0.12] bg-white/[0.03] p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      role="group"
      aria-label="Billing period"
    >
      <motion.span
        layoutId="billing-pill"
        transition={{ type: "spring", stiffness: 480, damping: 34 }}
        className="absolute inset-y-[3px] rounded-[8px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.9)]"
        style={{
          width: yearly ? "calc(50% - 3px)" : "calc(50% - 3px)",
          left: yearly ? "calc(50%)" : "3px",
        }}
      />
      <button
        type="button"
        onClick={() => {
          onChange(false);
        track("pricing_toggle_monthly");
        }}
        className={`relative z-10 min-w-[108px] rounded-[8px] px-5 py-2 text-[13px] font-medium tracking-[-0.01em] transition-colors duration-200 ${
          !yearly ? "text-black" : "text-white/50 hover:text-white/70"
        }`}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => {
          onChange(true);
          track("pricing_toggle_annual");
        }}
        className={`relative z-10 flex min-w-[148px] items-center justify-center gap-1.5 rounded-[8px] px-4 py-2 text-[13px] font-medium tracking-[-0.01em] transition-colors duration-200 ${
          yearly ? "text-black" : "text-white/50 hover:text-white/70"
        }`}
      >
        <span>Annual</span>
        <span
          className={`text-[10px] font-semibold tracking-[0.02em] ${
            yearly ? "text-black/55" : "text-[#39FF6A]/75"
          }`}
        >
          · Save 30%
        </span>
      </button>
    </div>
  );
}

function AdobeTrustBar() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-5 backdrop-blur-sm sm:px-6 sm:py-5">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(57,255,106,0.06) 0%, transparent 65%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
        aria-hidden
      />

      <div className="relative">
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          Included in every plan
        </p>

        <div className="mt-4 flex flex-col gap-4 sm:mt-5 sm:flex-row sm:items-stretch sm:justify-center sm:gap-0">
          {ADOBE_APPS.map((app, i) => (
            <div key={app.name} className="flex flex-1 items-center sm:justify-center">
              {i > 0 && (
                <div
                  className="mx-6 hidden h-10 w-px shrink-0 bg-white/[0.08] sm:block"
                  aria-hidden
                />
              )}
              <div className="flex w-full items-center gap-3.5 sm:w-auto sm:justify-center">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-black/40">
                  <Image
                    src={app.src}
                    alt={app.alt}
                    width={28}
                    height={28}
                    className="h-7 w-7 object-contain"
                  />
                </div>
                <div className="text-left">
                  <p className="text-[13px] font-medium tracking-[-0.01em] text-white/80">
                    {app.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/35">Native Adobe panel</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[13px] tracking-[-0.01em] text-white/45 sm:mt-5">
          One subscription.{" "}
          <span className="text-white/65">Both panels included.</span>
        </p>
      </div>
    </div>
  );
}

type LifetimeIntroState = {
  claimed: number;
  limit: number;
  soldOut: boolean;
};

export default function PricingSection({
  title = "Plans for every editing workflow.",
  subtitle,
  tiers,
  showToggle = false,
  footerNote,
  onCtaClick,
}: PricingSectionProps) {
  const [yearly, setYearly] = useState(false);
  const [introOffer, setIntroOffer] = useState<LifetimeIntroState>({
    claimed: 45,
    limit: 100,
    soldOut: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/offers/lifetime-intro")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || typeof data.claimed !== "number") return;
        setIntroOffer({
          claimed: data.claimed,
          limit: typeof data.limit === "number" ? data.limit : 100,
          soldOut: Boolean(data.soldOut),
        });
      })
      .catch(() => {
        /* keep seed fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openCheckout = useCallback(
    async (plan: string, billing: "monthly" | "yearly" | "once", tierName?: string, tierPrice?: number) => {
      try {
        if (tierName && tierPrice !== undefined) {
          initiateCheckout(tierName, tierPrice);
        }
      } catch {
        /* pixel optional */
      }
      const fallback = `/checkout`;
      try {
        const meta = getMetaClickIds();
        const response = await fetch("/api/checkout/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, billing, ...meta }),
        });
        const data = await response.json();
        if (!response.ok || !data.url) throw new Error(data.error || "Checkout unavailable");

        if (window.LemonSqueezy?.Url?.Open) {
          window.LemonSqueezy.Url.Open(data.url);
        } else if (window.createLemonSqueezy) {
          window.createLemonSqueezy();
          window.LemonSqueezy?.Url?.Open(data.url);
        } else {
          window.location.href = data.url;
        }
      } catch {
        window.location.href = fallback;
      }
    },
    [],
  );

  const openLSOverlay = useCallback(
    (plan: string, billing: "monthly" | "yearly" | "once", e: React.MouseEvent, tierName?: string, tierPrice?: number) => {
      e.preventDefault();
      if (tierName && tierPrice !== undefined) {
        trackCta("pricing", tierName.toLowerCase());
        track(`pricing_buy_${tierName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, { price: tierPrice });
      }
      openCheckout(plan, billing, tierName, tierPrice);
    },
    [openCheckout],
  );

  return (
    <section
      id="pricing"
      className="border-t border-white/[0.06] bg-[#080808] px-4 py-14 sm:px-6 lg:px-8 lg:py-20"
    >
      <div className="mx-auto max-w-[1080px]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.45, ease }}
          className="mx-auto max-w-2xl"
        >
          <div className="text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/32">
              Pricing
            </p>
            <h2 className="mx-auto mt-2.5 max-w-lg text-[clamp(1.875rem,4.2vw,2.625rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-white">
              {title}
            </h2>
            {subtitle && (
              <p className="mx-auto mt-3 max-w-md text-[14px] leading-6 text-white/42">
                {subtitle}
              </p>
            )}
            {showToggle && (
              <div className="mt-6 flex justify-center">
                <BillingToggle yearly={yearly} onChange={setYearly} />
              </div>
            )}
          </div>

          <div className="mt-7 sm:mt-8">
            <AdobeTrustBar />
          </div>
        </motion.div>

        <div className={`mt-8 grid gap-3 lg:mt-9 lg:items-end lg:gap-3.5 ${
          tiers.length === 1
            ? "mx-auto max-w-md lg:grid-cols-1"
            : tiers.length === 2
              ? "mx-auto max-w-3xl lg:grid-cols-2"
              : "lg:grid-cols-3"
        }`}>
          {tiers.map((tier, i) => {
            const isOneTime = tier.oneTime === true;
            const isYearly = !isOneTime && yearly && !!tier.yearlyPrice;
            const price = isOneTime
              ? tier.monthlyPrice
              : (isYearly ? tier.yearlyPrice! : tier.monthlyPrice);
            const resolvedHref = isOneTime
              ? (tier.ctaHref.startsWith("/checkout") ? "/checkout" : tier.ctaHref)
              : tier.ctaHref.startsWith("/checkout")
                ? `${tier.ctaHref}&billing=${isYearly ? "yearly" : "monthly"}`
                : tier.ctaHref;
            const lsBaseUrl = isOneTime
              ? tier.lsMonthlyUrl
              : isYearly
                ? (tier.lsYearlyUrl ?? tier.lsMonthlyUrl)
                : tier.lsMonthlyUrl;
            const ctaLabel = CTA_LABELS[tier.id] ?? tier.cta;
            const generation =
              (isYearly && tier.generation?.yearly) ||
              tier.generation?.monthly ||
              legacyGeneration(tier, isYearly);
            const highlights = resolveHighlights(tier);
            const featured = tier.featured === true;

            const handleCta = (e: React.MouseEvent) => {
              if (lsBaseUrl) {
                openLSOverlay(
                  tier.id,
                  isOneTime ? "once" : (isYearly ? "yearly" : "monthly"),
                  e,
                  tier.name,
                  price,
                );
              }
              else if (tier.onCtaClick ?? onCtaClick) {
                e.preventDefault();
                (tier.onCtaClick ?? onCtaClick)?.();
              }
            };

            const ctaClass = featured
              ? "bg-[#39FF6A] text-black hover:opacity-90"
              : "border border-white/[0.08] bg-white/[0.02] text-white/55 hover:border-white/14 hover:text-white/80";

            return (
              <motion.article
                key={tier.id}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.06, ease }}
                className={`relative flex flex-col overflow-hidden rounded-xl border ${
                  featured
                    ? tiers.length === 1
                      ? "z-10 border-white/[0.11] px-6 py-5 shadow-[0_16px_48px_rgba(0,0,0,0.45)] sm:px-6 sm:py-6"
                      : "z-10 border-white/[0.11] px-6 py-5 shadow-[0_16px_48px_rgba(0,0,0,0.45)] sm:px-6 sm:py-6 lg:-translate-y-4 lg:scale-[1.05] lg:origin-bottom"
                    : "border-white/[0.06] px-5 py-5 sm:px-5 sm:py-6"
                }`}
              >
                {featured && (
                  <>
                    <div
                      className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#39FF6A]/[0.08] via-[#0a0d0a] to-[#080808]"
                      aria-hidden
                    />
                    <div
                      className="pointer-events-none absolute -top-20 left-1/2 h-40 w-full -translate-x-1/2 opacity-70 blur-3xl"
                      style={{
                        background:
                          "radial-gradient(ellipse at center, rgba(57,255,106,0.12) 0%, transparent 72%)",
                      }}
                      aria-hidden
                    />
                    <div className="absolute inset-x-0 top-0 flex justify-center">
                      <span className="rounded-b-lg border border-t-0 border-white/[0.10] bg-[#0a0f0a]/90 px-3.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#39FF6A]/80 backdrop-blur-sm">
                        {tier.badge ?? "Most popular"}
                      </span>
                    </div>
                  </>
                )}
                {!featured && (
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0e0e0e] to-[#080808]"
                    aria-hidden
                  />
                )}

                <div className={`relative flex flex-col ${featured ? "pt-5" : ""}`}>
                  <p
                    className={`text-[11px] font-medium uppercase tracking-[0.14em] ${
                      featured ? "text-white/45" : "text-white/28"
                    }`}
                  >
                    {tier.name}
                  </p>
                  <div className="mt-3">
                    {tier.compareAtPrice != null && (
                      <p className="mb-1.5">
                        {featured ? (
                          <span
                            className="relative inline-block text-[13px] font-medium tracking-[-0.01em] text-white/35"
                            aria-label={`Was $${fmtPrice(tier.compareAtPrice)}`}
                          >
                            ${fmtPrice(tier.compareAtPrice)}
                            <span
                              aria-hidden
                              className="pointer-events-none absolute left-[-3%] top-1/2 h-[1.5px] w-[106%] -translate-y-1/2 rounded-full bg-red-400/80"
                            />
                          </span>
                        ) : (
                          <span className="text-[13px] font-medium text-white/28 line-through tracking-[-0.01em]">
                            ${fmtPrice(tier.compareAtPrice)}
                          </span>
                        )}
                      </p>
                    )}
                    <div className="flex flex-wrap items-end gap-x-2.5 gap-y-1">
                      <p
                        className={`flex items-start leading-none tracking-[-0.045em] ${
                          featured ? "text-white" : "text-white/90"
                        }`}
                      >
                        <span
                          className={`mr-0.5 mt-[0.18em] font-semibold ${
                            featured ? "text-[1.35rem]" : "text-[1.15rem]"
                          } text-white/55`}
                        >
                          $
                        </span>
                        <span
                          className={`font-semibold ${
                            featured
                              ? "text-[clamp(2.5rem,5vw,3.25rem)]"
                              : "text-[clamp(2rem,4vw,2.5rem)]"
                          }`}
                        >
                          {fmtPrice(price)}
                        </span>
                      </p>
                      {!isOneTime && (
                        <span className="mb-1.5 text-[13px] text-white/30">
                          /{isYearly ? "yr" : "mo"}
                        </span>
                      )}
                      {isOneTime && (
                        <span className="mb-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium tracking-[-0.01em] text-white/45">
                          one-time
                        </span>
                      )}
                    </div>
                  </div>

                  {featured && isOneTime && (
                    <OfferCountdown
                      variant="urgency"
                      label="Ends in"
                      className="mt-2.5"
                    />
                  )}

                  {featured && isOneTime && (
                    <LifetimeSpotsBar
                      claimed={introOffer.claimed}
                      limit={introOffer.limit}
                      soldOut={introOffer.soldOut}
                    />
                  )}

                  {generation && (
                    <div className={featured && isOneTime ? "mt-3.5" : "mt-3"}>
                      <p
                        className={`font-semibold tracking-[-0.02em] ${
                          featured
                            ? "text-[17px] text-white sm:text-[18px]"
                            : "text-[16px] text-white/75 sm:text-[17px]"
                        }`}
                      >
                        {generation.shots}
                        {!isOneTime && (
                          <span className="font-normal text-white/30">
                            {" "}
                            / {isYearly ? "yr" : "mo"}
                          </span>
                        )}
                      </p>
                      {generation.seconds && (
                        <p className={`mt-0.5 text-[12px] ${featured ? "text-white/40" : "text-white/20"}`}>
                          {generation.seconds}
                        </p>
                      )}
                    </div>
                  )}

                  {tier.bonus && (
                    <div className="mt-3.5 rounded-lg border border-[#39FF6A]/25 bg-[#39FF6A]/[0.08] px-3 py-2.5">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-snug">
                        <span className="rounded-[5px] bg-[#39FF6A] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-black">
                          Free
                        </span>
                        <span className="font-medium text-[#39FF6A]/90">{tier.bonus}</span>
                      </p>
                    </div>
                  )}

                  {highlights.length > 0 && (
                    <ul className="mt-3.5 flex flex-col gap-2 border-t border-white/[0.06] pt-3.5">
                      {highlights.map((item) => (
                        <li key={item} className="flex items-center gap-2.5">
                          <Check
                            size={13}
                            strokeWidth={2}
                            className={`shrink-0 ${
                              featured ? "text-[#39FF6A]/55" : "text-white/15"
                            }`}
                            aria-hidden
                          />
                          <span
                            className={`text-[12px] leading-snug ${
                              featured ? "text-white/60" : "text-white/38"
                            }`}
                          >
                            {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-5">
                    {lsBaseUrl || tier.onCtaClick || onCtaClick ? (
                      <button
                        type="button"
                        onClick={handleCta}
                        className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors ${ctaClass}`}
                      >
                        {ctaLabel}
                      </button>
                    ) : (
                      <Link
                        href={resolvedHref}
                        className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors ${ctaClass}`}
                      >
                        {ctaLabel}
                      </Link>
                    )}
                    {featured && isOneTime && (
                      <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] text-white/35">
                        <ShieldCheck size={12} strokeWidth={2} className="text-[#39FF6A]/50" aria-hidden />
                        7-day money-back guarantee
                      </p>
                    )}
                  </div>

                  {featured && tiers.length === 1 && (
                    <div className="mt-4 border-t border-white/[0.06] pt-4">
                      <SocialProofBar compact />
                    </div>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>

        {tiers.length !== 1 && (
          <div className="mt-8 flex justify-center">
            <SocialProofBar />
          </div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, ease }}
          className="mt-10 border-t border-white/[0.06] pt-7 lg:mt-11"
        >
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {TRUST_ITEMS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2">
                <Icon size={13} strokeWidth={2} className="text-white/22" aria-hidden />
                <span className="text-[12px] text-white/35">{label}</span>
              </li>
            ))}
          </ul>
          {footerNote && (
            <p className="mt-5 text-center text-[12px] text-white/25">{footerNote}</p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
