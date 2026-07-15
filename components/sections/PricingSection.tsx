"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Check, ShieldCheck, Lock, Monitor } from "lucide-react";
import { initiateCheckout, getMetaClickIds } from "@/lib/pixel";
import { track, trackCta } from "@/lib/track";

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
  /** Shown as strikethrough next to the main price (e.g. 199 next to 99). */
  compareAtPrice?: number;
  /** One-time purchase — hide /mo and billing toggle behavior. */
  oneTime?: boolean;
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

export default function PricingSection({
  title = "Plans for every editing workflow.",
  subtitle,
  tiers,
  showToggle = false,
  footerNote,
  onCtaClick,
}: PricingSectionProps) {
  const [yearly, setYearly] = useState(false);
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
          tiers.length === 1 ? "mx-auto max-w-md lg:grid-cols-1" : "lg:grid-cols-3"
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
              ? (tier.lsMonthlyUrl ?? true)
              : isYearly
                ? (tier.lsYearlyUrl ?? tier.lsMonthlyUrl)
                : tier.lsMonthlyUrl;
            const ctaLabel = CTA_LABELS[tier.id] ?? tier.cta;
            const generation =
              (isYearly && tier.generation?.yearly) ||
              tier.generation?.monthly ||
              legacyGeneration(tier, isYearly);
            const highlights = resolveHighlights(tier);
            const featured = tier.featured || isOneTime;

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
                      ? "z-10 border-white/[0.11] px-6 py-6 shadow-[0_16px_48px_rgba(0,0,0,0.45)] sm:px-6 sm:py-7"
                      : "z-10 border-white/[0.11] px-6 py-6 shadow-[0_16px_48px_rgba(0,0,0,0.45)] sm:px-6 sm:py-7 lg:-translate-y-4 lg:scale-[1.05] lg:origin-bottom"
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
                  <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {tier.compareAtPrice != null && (
                      <span className="text-[18px] font-medium text-white/30 line-through tracking-[-0.02em]">
                        ${fmtPrice(tier.compareAtPrice)}
                      </span>
                    )}
                    <span className="text-[13px] text-white/25">$</span>
                    <span
                      className={`font-semibold tracking-[-0.04em] ${
                        featured
                          ? "text-[clamp(2.25rem,4vw,3rem)] text-white"
                          : "text-[clamp(1.875rem,3.5vw,2.375rem)] text-white/90"
                      }`}
                    >
                      {fmtPrice(price)}
                    </span>
                    {!isOneTime && (
                      <span className="ml-1 text-[13px] text-white/25">
                        /{isYearly ? "yr" : "mo"}
                      </span>
                    )}
                    {isOneTime && (
                      <span className="ml-1 text-[13px] text-white/35">one-time</span>
                    )}
                  </div>

                  {generation && (
                    <div className="mt-3">
                      <p
                        className={`font-semibold tracking-[-0.02em] ${
                          featured
                            ? "text-[18px] text-white sm:text-[19px]"
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
                        <p className="mt-0.5 text-[11px] text-white/20">
                          {generation.seconds}
                        </p>
                      )}
                    </div>
                  )}

                  {highlights.length > 0 && (
                    <ul className="mt-4 flex flex-1 flex-col gap-1.5 border-t border-white/[0.06] pt-4">
                      {highlights.map((item) => (
                        <li key={item} className="flex items-center gap-2.5">
                          <Check
                            size={13}
                            strokeWidth={2}
                            className={`shrink-0 ${
                              featured ? "text-[#39FF6A]/45" : "text-white/15"
                            }`}
                            aria-hidden
                          />
                          <span
                            className={`text-[12px] leading-snug ${
                              featured ? "text-white/55" : "text-white/38"
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
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>

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
