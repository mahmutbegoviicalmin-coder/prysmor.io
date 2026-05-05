"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, ShieldCheck } from "lucide-react";

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

  const openLSOverlay = useCallback((baseUrl: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      window.location.href = "/sign-in?redirect_url=/pricing";
      return;
    }
    const url = `${baseUrl}?embed=1&dark=1&checkout[custom][user_id]=${user.id}`;
    if (window.LemonSqueezy?.Url?.Open) {
      window.LemonSqueezy.Url.Open(url);
    } else if (window.createLemonSqueezy) {
      window.createLemonSqueezy();
      window.LemonSqueezy?.Url?.Open(url);
    } else {
      window.location.href = url;
    }
  }, [user]);

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
          initial={{ opacity: 0, y: 16 }}
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
                  onClick={() => setYearly(isYr)}
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
              const btnStyle: React.CSSProperties = {
                width: "100%",
                padding: "13px 20px",
                fontSize: "14px",
                fontWeight: 600,
                borderRadius: "8px",
                cursor: "pointer",
                letterSpacing: "0.01em",
                transition: "background 0.15s, box-shadow 0.15s",
                // All cards: white button with dark text — matches reference exactly
                background: "rgba(255,255,255,0.92)",
                color: "#0a0a0a",
                border: "none",
                boxShadow: tier.featured
                  ? "0 0 28px rgba(57,255,106,0.25)"
                  : "none",
              };

              const enter = (e: React.MouseEvent) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "white";
                if (tier.featured) el.style.boxShadow = "0 0 40px rgba(57,255,106,0.4)";
              };
              const leave = (e: React.MouseEvent) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "rgba(255,255,255,0.92)";
                if (tier.featured) el.style.boxShadow = "0 0 28px rgba(57,255,106,0.25)";
              };

              if (lsBaseUrl) {
                return (
                  <button
                    onClick={(e) => openLSOverlay(lsBaseUrl, e)}
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
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.55, delay: i * 0.08, ease }}
                className={`pricing-card${tier.featured ? " pricing-card--featured" : ""}`}
                style={{
                  position: "relative",
                  borderRadius: "14px",
                  padding: tier.featured ? "36px 28px" : "32px 24px",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  background: tier.featured
                    ? "linear-gradient(145deg, #0f2e14 0%, #0a1f0d 35%, #061409 65%, #040e06 100%)"
                    : "#111213",
                  border: tier.featured
                    ? `1px solid rgba(57,255,106,0.28)`
                    : "1px solid #1c1c1c",
                  borderTop: tier.featured
                    ? `1px solid rgba(57,255,106,0.28)`
                    : "1px solid #1c1c1c",
                  transform: tier.featured ? "translateY(-14px)" : "none",
                  boxShadow: tier.featured
                    ? `0 0 0 1px rgba(57,255,106,0.1), 0 20px 60px rgba(57,255,106,0.12), 0 40px 80px rgba(0,0,0,0.5)`
                    : "0 8px 32px rgba(0,0,0,0.4)",
                }}
              >

                {/* ── Content (above overlays) ─────────────────────────── */}
                <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1 }}>

                  {/* ① Badge — featured only */}
                  {tier.featured && (
                    <div style={{ marginBottom: "12px" }}>
                      <span style={{
                        display: "inline-block",
                        fontSize: "10px",
                        fontWeight: 600,
                        letterSpacing: "0.5px",
                        color: GREEN,
                        background: "rgba(57,255,106,0.08)",
                        border: "1px solid rgba(57,255,106,0.2)",
                        borderRadius: "4px",
                        padding: "3px 8px",
                      }}>
                        Most popular
                      </span>
                    </div>
                  )}

                  {/* Plan name */}
                  <p style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: tier.featured ? "rgba(57,255,106,0.9)" : "#888",
                    letterSpacing: "0.02em",
                    margin: "0 0 20px",
                  }}>
                    {tier.name}
                  </p>

                  {/* ② Price */}
                  <div key={isYearly ? "yr" : "mo"} style={{ marginBottom: "6px" }}>
                    <div className="flex items-baseline" style={{ gap: "4px" }}>
                      <span style={{
                        fontSize: "16px",
                        fontWeight: 500,
                        color: "white",
                        lineHeight: 1,
                        alignSelf: "flex-start",
                        marginTop: "6px",
                        opacity: 0.7,
                      }}>$</span>
                      <span style={{
                        fontSize: "clamp(40px, 10vw, 52px)",
                        fontWeight: 800,
                        color: "white",
                        letterSpacing: "-2px",
                        lineHeight: 1,
                      }}>
                        {fmtPrice(price)}
                      </span>
                      <span style={{
                        fontSize: "13px",
                        color: "#555",
                        fontWeight: 400,
                        marginLeft: "2px",
                      }}>
                        {isYearly ? "per year" : "per month"}
                      </span>
                    </div>

                    {/* Per-day */}
                    {tier.yearlyPerDay && (
                      <p style={{ fontSize: "12px", color: "#555", margin: "6px 0 0" }}>
                        ${tier.yearlyPerDay}/day
                      </p>
                    )}
                    {isYearly && tier.yearlySave && (
                      <p style={{ fontSize: "11px", color: "#555", margin: "4px 0 0" }}>
                        <span style={{ textDecoration: "line-through", color: "#3a3a3a", marginRight: "4px" }}>${fmtOrigYr}</span>
                        Save ${tier.yearlySave}
                      </p>
                    )}
                  </div>

                  {/* ③ Description */}
                  <p style={{
                    fontSize: "13px",
                    color: tier.featured ? "rgba(200,255,210,0.55)" : "#888",
                    fontWeight: 400,
                    lineHeight: 1.5,
                    margin: "12px 0 20px",
                  }}>
                    {tier.description}
                  </p>

                  {/* ④ Credits badge */}
                  {unitMain && (
                    <div
                      key={isYearly ? "unit-yr" : "unit-mo"}
                      style={{
                        display: "inline-flex",
                        flexDirection: "column",
                        background: tier.featured
                          ? "rgba(57,255,106,0.07)"
                          : "rgba(255,255,255,0.03)",
                        border: `1px solid ${tier.featured ? "rgba(57,255,106,0.2)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: "7px",
                        padding: "7px 14px",
                        marginBottom: "20px",
                        gap: "2px",
                        alignSelf: "flex-start",
                      }}
                    >
                      <span style={{ fontSize: "13px", fontWeight: 600 }}>
                        {unitMain.split(" ").map((word, wi) => {
                          const isNum = /^\d+s$/.test(word);
                          return (
                            <span key={wi} style={{
                              color: isNum ? "white" : "#555",
                              fontWeight: isNum ? 700 : 400,
                              marginRight: wi < unitMain.split(" ").length - 1 ? "4px" : "0",
                            }}>
                              {word}
                            </span>
                          );
                        })}
                      </span>
                      {unitSub && (
                        <span style={{ fontSize: "11px", color: "#444", fontWeight: 300 }}>
                          ≈ {unitSub}
                        </span>
                      )}
                    </div>
                  )}

                  {/* ⑤ CTA button */}
                  {renderBtn()}

                  {/* ⑥ Divider */}
                  <div style={{
                    height: "1px",
                    background: tier.featured ? "rgba(57,255,106,0.15)" : "rgba(255,255,255,0.07)",
                    margin: "22px 0 18px",
                  }} />

                  {/* ⑦ Features label */}
                  <p style={{
                    fontSize: "12px",
                    color: tier.featured ? "rgba(200,255,210,0.5)" : "#777",
                    fontWeight: 400,
                    margin: "0 0 14px",
                  }}>
                    {featLabel}
                  </p>

                  {/* ⑧ Features list */}
                  <ul style={{
                    listStyle: "none",
                    padding: 0,
                    margin: "0 0 auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}>
                    {tier.bullets.map((b) => (
                      <li key={b} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <span style={{
                          width: "17px",
                          height: "17px",
                          borderRadius: "50%",
                          background: "rgba(57,255,106,0.12)",
                          border: "1px solid rgba(57,255,106,0.25)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: "1px",
                        }}>
                          <Check size={9} color={GREEN} strokeWidth={3.5} />
                        </span>
                        <span style={{
                          fontSize: "13px",
                          color: tier.featured ? "rgba(220,255,228,0.75)" : "#999",
                          fontWeight: 400,
                          lineHeight: 1.5,
                        }}>
                          {b}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* ⑨ Billed note — pinned to bottom */}
                  <p style={{
                    fontSize: "11px",
                    color: tier.featured ? "rgba(200,255,210,0.4)" : "#555",
                    textAlign: "center",
                    margin: "24px 0 0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                  }}>
                    <ShieldCheck size={12} color={GREEN} strokeWidth={2} style={{ opacity: 0.7 }} />
                    Billed {isYearly ? "annually" : "monthly"}. Cancel anytime.
                  </p>

                </div>
              </motion.div>
            );
          })}
        </div>

        {footerNote && (
          <div style={{
            marginTop: "40px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "13px",
            color: "#aaa",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
            padding: "10px 18px",
          }}>
            <ShieldCheck size={15} color={GREEN} strokeWidth={2} />
            {footerNote}
          </div>
        )}
      </div>

      {/* Info modal */}
      <AnimatePresence>
        {infoOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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
