"use client";

import { useEffect, useState } from "react";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Milliseconds until local midnight (resets daily). */
function msUntilMidnight(now = Date.now()) {
  const d = new Date(now);
  const end = new Date(d);
  end.setHours(24, 0, 0, 0);
  return Math.max(0, end.getTime() - now);
}

function split(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { h, m, s };
}

type Variant = "default" | "urgency";

function DigitGroup({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex flex-col items-center gap-1.5">
      <span
        className="flex h-11 min-w-[2.75rem] items-center justify-center rounded-lg border border-white/[0.14] bg-black/50 px-2.5 text-[17px] font-medium leading-none tracking-[0.06em] text-white tabular-nums"
        style={{ fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' }}
      >
        {value}
      </span>
      <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-white/45">
        {label}
      </span>
    </span>
  );
}

/**
 * Daily intro-price countdown — resets at local midnight.
 * default = hero card; urgency = compact red line for pricing.
 */
export default function OfferCountdown({
  className = "",
  variant = "default",
  label = "Intro price ends in",
}: {
  className?: string;
  variant?: Variant;
  label?: string;
}) {
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setMs(msUntilMidnight());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (ms === null) {
    return (
      <div className={`flex items-center ${className}`} aria-hidden>
        <span
          className={
            variant === "urgency"
              ? "h-5 w-36 rounded bg-red-500/10"
              : "h-14 w-52 rounded-xl bg-white/[0.05]"
          }
        />
      </div>
    );
  }

  const { h, m, s } = split(ms);
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`;

  if (variant === "urgency") {
    return (
      <p
        className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] leading-none ${className}`}
        role="timer"
        aria-live="off"
        aria-label={`${label} ${h} hours ${m} minutes ${s} seconds`}
      >
        <span className="font-medium text-red-400/90">{label}</span>
        <span
          className="font-semibold tabular-nums tracking-[0.08em] text-red-300"
          style={{ fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' }}
        >
          {clock}
        </span>
      </p>
    );
  }

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/[0.10] bg-black/55 px-4 py-3 backdrop-blur-md ${className}`}
    >
      <span className="text-[12px] font-medium tracking-[-0.01em] text-white/55">
        {label}
      </span>
      <div
        className="flex items-center gap-1.5"
        role="timer"
        aria-live="off"
        aria-label={`${label} ${h} hours ${m} minutes ${s} seconds`}
      >
        <DigitGroup value={pad(h)} label="hrs" />
        <span className="-mt-4 px-0.5 text-[15px] font-light text-white/30">:</span>
        <DigitGroup value={pad(m)} label="min" />
        <span className="-mt-4 px-0.5 text-[15px] font-light text-white/30">:</span>
        <DigitGroup value={pad(s)} label="sec" />
      </div>
    </div>
  );
}
