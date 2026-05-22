"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, ShieldCheck } from "lucide-react";
import { initiateCheckout } from "@/lib/pixel";
import { track } from "@/lib/track";
import { getRefCodeFromCookie } from "@/components/site/RefTracker";


declare global {
  interface Window {
    LemonSqueezy?: {
      Setup: () => void;
      Url: { Open: (url: string) => void; Close: () => void };
    };
    createLemonSqueezy?: () => void;
  }
}

export interface PriceTier {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  yearlyPerDay?: string;
  yearlySave?: number;
  description: string;
  unit?: string;
  yearlyUnit?: string;
  featured?: boolean;
  badge?: string;
  bullets: string[];
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
  infoContent?: string;
  onCtaClick?: () => void;
}

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];
const GREEN = "#39FF6A";


const CTA_LABELS: Record<string, string> = {
  starter: "Start creating",
  pro: "Choose Pro",
  exclusive: "Choose Exclusive",
};

const FEATURES_LABEL: Record<string, string> = {
  starter: "Plan includes",
  pro: "All Starter features, plus",
  exclusive: "All Pro features, plus",
};

export default function PricingSection({
  title = "Pick a plan",
  subtitle,
  tiers,
  showToggle = false,
  footerNote,
  infoContent,
  onCtaClick,
}: PricingSectionProps) {
  const [yearly, setYearly] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const { user } = useUser();

  /** Directly open LS checkout for a logged-in user */
  const openLSCheckout = useCallback((baseUrl: string, tierName?: string, tierPrice?: number) => {
    if (!user) return;
    try {
      if (typeof window !== 'undefined' && window.fbq && tierName && tierPrice !== undefined) {
        initiateCheckout(tierName, tierPrice);
      }
    } catch (_) {}
    const refCode = getRefCodeFromCookie();
    let url = `${baseUrl}?embed=1&dark=1&checkout[custom][user_id]=${user.id}`;
    if (refCode) url += `&checkout[custom][ref_code]=${encodeURIComponent(refCode)}`;
    if (window.LemonSqueezy?.Url?.Open) {
      window.LemonSqueezy.Url.Open(url);
    } else if (window.createLemonSqueezy) {
      window.createLemonSqueezy();
      window.LemonSqueezy?.Url?.Open(url);
    } else {
      window.location.href = url;
    }
  }, [user]);

  const openLSOverlay = useCallback((baseUrl: string, e: React.MouseEvent, tierName?: string, tierPrice?: number) => {
    e.preventDefault();
    if (tierName && tierPrice !== undefined) {
      track(`pricing_click_${tierName.toLowerCase()}`, { plan: tierName.toLowerCase(), price: tierPrice });
    }
    if (!user) {
      // Not logged in — send to sign-in, after login Clerk returns to /#pricing
      window.location.href = '/sign-in?redirect_url=' + encodeURIComponent('/#pricing');
      return;
    }
    openLSCheckout(baseUrl, tierName, tierPrice);
  }, [user, openLSCheckout]);

  return (
    <section
      id="pricing"
      style={{
        background: "#0a0a0a",
        padding: "100px 20px 120px",
        borderTop: "1px solid #111",
        textAlign: "center",
      }}
    >
      <div className="mx-auto" style={{ maxWidth: "1060px" }}>

        {/* ── Heading ───────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 1, y: 0 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          style={{ marginBottom: "56px" }}
        >
          <p style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "3px",
            color: GREEN,
            marginBottom: "20px",
          }}>
            Pricing
          </p>
          <h2 style={{
            fontSize: "clamp(32px, 4.5vw, 56px)",
            fontWeight: 800,
            color: "white",
            letterSpacing: "-2px",
            lineHeight: 1.08,
            margin: "0 0 16px",
          }}>
            {title}
          </h2>
          {subtitle && (
            <p style={{ fontSize: "15px", color: "#666", fontWeight: 400, lineHeight: 1.6, margin: 0 }}>
              {subtitle}
            </p>
          )}

          {/* Radio toggle */}
          {showToggle && (
            <div className="inline-flex items-center gap-6" style={{ marginTop: "36px" }}>
              {([false, true] as const).map((isYr) => (
                <label
                  key={String(isYr)}
                  className="inline-flex items-center gap-2 cursor-pointer select-none"
                  onClick={() => { setYearly(isYr); track('pricing_toggle', { billing: isYr ? 'annual' : 'monthly' }); }}
                >
                  <span style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    border: `2px solid ${yearly === isYr ? GREEN : "#333"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "border-color 0.15s",
                  }}>
                    {yearly === isYr && (
                      <span style={{
                        width: "9px",
                        height: "9px",
                        borderRadius: "50%",
                        background: GREEN,
                      }} />
                    )}
                  </span>
                  <span style={{
                    fontSize: "14px",
                    fontWeight: yearly === isYr ? 600 : 400,
                    color: yearly === isYr ? "white" : "#555",
                    transition: "color 0.15s",
                  }}>
                    {isYr ? "Annually" : "Monthly"}
                  </span>
                  {isYr && (
                    <span style={{
                      background: "rgba(57,255,106,0.12)",
                      border: "1px solid rgba(57,255,106,0.2)",
                      color: GREEN,
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "4px",
                    }}>
                      Save 30%
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Cards ─────────────────────────────────────────────────────── */}
        <div
          className={tiers.length === 2 ? "grid sm:grid-cols-2" : "grid sm:grid-cols-2 lg:grid-cols-3"}
          style={{ gap: "16px", alignItems: "stretch" }}
        >
          {tiers.map((tier, i) => {
            const isYearly    = yearly && !!tier.yearlyPrice;
            const price       = isYearly ? tier.yearlyPrice! : tier.monthlyPrice;
            const origYr      = tier.monthlyPrice * 12;
            const fmtPrice    = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2);
            const fmtOrigYr   = Number.isInteger(origYr) ? String(origYr) : origYr.toFixed(2);
            const resolvedHref = tier.ctaHref.startsWith("/checkout")
              ? `${tier.ctaHref}&billing=${isYearly ? "yearly" : "monthly"}`
              : tier.ctaHref;
            const lsBaseUrl   = isYearly ? (tier.lsYearlyUrl ?? tier.lsMonthlyUrl) : tier.lsMonthlyUrl;
            const activeUnit  = isYearly && tier.yearlyUnit ? tier.yearlyUnit : tier.unit;
            const ctaLabel    = CTA_LABELS[tier.id] ?? tier.cta;
            const featLabel   = FEATURES_LABEL[tier.id] ?? "Plan includes";

            const [unitMain, unitSub] = activeUnit
              ? activeUnit.split("≈").map((s) => s.trim())
              : ["", ""];

            /* CTA button */
            const renderBtn = () => {
              const btnStyle: React.CSSProperties = tier.featured ? {
                width: "100%",
                padding: "14px 20px",
                fontSize: "14px",
                fontWeight: 600,
                borderRadius: "9px",
                cursor: "pointer",
                letterSpacing: "0.01em",
                transition: "opacity 0.15s, box-shadow 0.15s",
                background: GREEN,
                color: "#040e06",
                border: "none",
                boxShadow: "0 0 24px rgba(57,255,106,0.2)",
              } : {
                width: "100%",
                padding: "13px 20px",
                fontSize: "14px",
                fontWeight: 500,
                borderRadius: "9px",
                cursor: "pointer",
                letterSpacing: "0.01em",
                transition: "background 0.15s, border-color 0.15s",
                background: "transparent",
                color: "rgba(255,255,255,0.6)",
                border: "1px solid #2a2a2a",
              };

              const enter = (e: React.MouseEvent) => {
                const el = e.currentTarget as HTMLElement;
                if (tier.featured) {
                  el.style.opacity = "0.88";
                  el.style.boxShadow = "0 0 36px rgba(57,255,106,0.35)";
                } else {
                  el.style.background = "rgba(255,255,255,0.04)";
                  el.style.borderColor = "#3a3a3a";
                  el.style.color = "white";
                }
              };
              const leave = (e: React.MouseEvent) => {
                const el = e.currentTarget as HTMLElement;
                if (tier.featured) {
                  el.style.opacity = "1";
                  el.style.boxShadow = "0 0 24px rgba(57,255,106,0.2)";
                } else {
                  el.style.background = "transparent";
                  el.style.borderColor = "#2a2a2a";
                  el.style.color = "rgba(255,255,255,0.6)";
                }
              };

              if (lsBaseUrl) {
                return (
                  <button
                    onClick={(e) => openLSOverlay(lsBaseUrl, e, tier.name, price)}
                    className="inline-flex items-center justify-center"
                    style={btnStyle}
                    onMouseEnter={enter}
                    onMouseLeave={leave}
                  >
                    {ctaLabel}
                  </button>
                );
              }
              if (tier.onCtaClick ?? onCtaClick) {
                return (
                  <button
                    onClick={tier.onCtaClick ?? onCtaClick}
                    className="inline-flex items-center justify-center"
                    style={btnStyle}
                    onMouseEnter={enter}
                    onMouseLeave={leave}
                  >
                    {ctaLabel}
                  </button>
                );
              }
              return (
                <Link
                  href={resolvedHref}
                  className="inline-flex items-center justify-center"
                  style={{ ...btnStyle, textDecoration: "none" }}
                >
                  {ctaLabel}
                </Link>
              );
            };

            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 1, y: 0 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.55, delay: i * 0.08, ease }}
                className={`pricing-card${tier.featured ? " pricing-card--featured" : ""}`}
                style={{
                  position: "relative",
                  borderRadius: "16px",
                  padding: "32px 28px 28px",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  background: tier.featured ? "#0c1410" : "#0f0f0f",
                  border: tier.featured
                    ? "1px solid rgba(57,255,106,0.22)"
                    : "1px solid #1d1d1d",
                  borderTop: tier.featured
                    ? "2px solid rgba(57,255,106,0.55)"
                    : "1px solid #1d1d1d",
                  boxShadow: tier.featured
                    ? "0 0 0 4px rgba(57,255,106,0.04), 0 24px 64px rgba(0,0,0,0.5), 0 0 60px rgba(57,255,106,0.08)"
                    : "0 4px 24px rgba(0,0,0,0.3)",
                  transform: tier.featured ? "translateY(-10px)" : "none",
                }}
              >
                {/* Subtle radial glow from top for featured */}
                {tier.featured && (
                  <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: "120px",
                    background: "radial-gradient(ellipse 80% 60px at 50% 0%, rgba(57,255,106,0.07), transparent)",
                    borderRadius: "16px 16px 0 0",
                    pointerEvents: "none",
                  }} />
                )}

                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>

                  {/* ① Plan name + badge */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "22px" }}>
                    <span style={{
                      fontSize: "11px", fontWeight: 600, letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: tier.featured ? GREEN : "#4a4a4a",
                    }}>
                      {tier.name}
                    </span>
                    {tier.featured && (
                      <span style={{
                        fontSize: "10px", fontWeight: 500,
                        color: "rgba(57,255,106,0.65)",
                        background: "rgba(57,255,106,0.07)",
                        border: "1px solid rgba(57,255,106,0.18)",
                        borderRadius: "20px", padding: "3px 9px",
                      }}>
                        Most popular
                      </span>
                    )}
                  </div>

                  {/* ② Price block */}
                  <div key={isYearly ? "yr" : "mo"} style={{ marginBottom: "20px" }}>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: "5px", marginBottom: "8px" }}>
                      <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)", paddingBottom: "9px" }}>$</span>
                      <span style={{
                        fontSize: "clamp(46px, 9vw, 60px)",
                        fontWeight: 700,
                        color: "white",
                        letterSpacing: "-3px",
                        lineHeight: 1,
                      }}>
                        {fmtPrice(price)}
                      </span>
                      <span style={{ fontSize: "13px", color: "#3a3a3a", paddingBottom: "7px" }}>
                        /{isYearly ? "yr" : "mo"}
                      </span>
                    </div>

                    {/* Per-day + description inline */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      {tier.yearlyPerDay && (
                        <span style={{
                          fontSize: "13px", fontWeight: 600,
                          color: tier.featured ? "rgba(57,255,106,0.8)" : "rgba(57,255,106,0.45)",
                        }}>
                          ${tier.yearlyPerDay}/day
                        </span>
                      )}
                      <span style={{ fontSize: "12px", color: "#383838" }}>·</span>
                      <span style={{ fontSize: "12px", color: "#484848" }}>{tier.description}</span>
                    </div>
                    {isYearly && tier.yearlySave && (
                      <span style={{ fontSize: "11px", color: "rgba(57,255,106,0.5)", fontWeight: 500, display: "block", marginTop: "5px" }}>
                        Save ${tier.yearlySave} vs monthly
                      </span>
                    )}
                  </div>

                  {/* ③ CTA */}
                  <div style={{ marginBottom: "26px" }}>
                    {renderBtn()}
                  </div>

                  {/* ④ Divider */}
                  <div style={{ height: "1px", background: tier.featured ? "rgba(57,255,106,0.1)" : "rgba(255,255,255,0.05)", marginBottom: "22px" }} />

                  {/* ⑤ Credits callout */}
                  {unitMain && (
                    <div key={isYearly ? "unit-yr" : "unit-mo"} style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      marginBottom: "20px",
                      padding: "12px 14px",
                      background: tier.featured ? "rgba(57,255,106,0.05)" : "rgba(255,255,255,0.02)",
                      border: tier.featured ? "1px solid rgba(57,255,106,0.12)" : "1px solid rgba(255,255,255,0.05)",
                      borderRadius: "10px",
                    }}>
                      <span style={{
                        fontSize: "32px", fontWeight: 800,
                        color: tier.featured ? "white" : "rgba(255,255,255,0.9)",
                        letterSpacing: "-1.5px", lineHeight: 1, flexShrink: 0,
                      }}>
                        {unitMain.split(" ")[0]}
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: tier.featured ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.45)", margin: 0 }}>
                          {unitMain.split(" ").slice(1).join(" ")}
                        </p>
                        {unitSub && (
                          <p style={{ fontSize: "12px", fontWeight: 500, color: tier.featured ? "rgba(57,255,106,0.6)" : "rgba(255,255,255,0.3)", margin: 0 }}>
                            ≈ {unitSub} of footage
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ⑥ Features label */}
                  <p style={{ fontSize: "10px", color: "#3d3d3d", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 12px" }}>
                    {featLabel}
                  </p>

                  {/* ⑦ Features list */}
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 auto", display: "flex", flexDirection: "column", gap: "10px" }}>
                    {tier.bullets.map((b) => (
                      <li key={b} style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                        <Check
                          size={12}
                          color={tier.featured ? "rgba(57,255,106,0.7)" : "#3a3a3a"}
                          strokeWidth={2.5}
                          style={{ flexShrink: 0, marginTop: "2px" }}
                        />
                        <span style={{
                          fontSize: "13px",
                          color: tier.featured ? "rgba(255,255,255,0.65)" : "#5e5e5e",
                          lineHeight: 1.5,
                        }}>
                          {b}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* ⑧ Billing note */}
                  <p style={{ fontSize: "11px", color: "#282828", margin: "22px 0 0", textAlign: "center" }}>
                    Billed {isYearly ? "annually" : "monthly"} · Cancel anytime
                  </p>

                </div>
              </motion.div>
            );
          })}
        </div>

        {footerNote && (
          <div style={{
            marginTop: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            fontSize: "12px",
            color: "rgba(255,255,255,0.25)",
          }}>
            <ShieldCheck size={12} color="rgba(57,255,106,0.5)" strokeWidth={2} />
            {footerNote}
          </div>
        )}
      </div>

      {/* Info modal */}
      <AnimatePresence>
        {infoOpen && (
          <motion.div
            initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setInfoOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-sm w-full p-7"
              style={{ background: "#0c0c0c", border: "1px solid #1e1e1e", borderRadius: "16px" }}
            >
              <button
                onClick={() => setInfoOpen(false)}
                className="absolute top-4 right-4"
                style={{ color: "#444" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "white"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#444"; }}
              >
                <X className="w-4 h-4" />
              </button>
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "white", marginBottom: "12px" }}>
                What are seconds?
              </h3>
              <p style={{ fontSize: "13px", color: "#555", lineHeight: 1.7 }}>
                {infoContent ?? 'In Prysmor, "seconds" refers to the total duration of video effects you can generate per month. Credits reset on your billing date.'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
