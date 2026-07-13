"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type PurchaseState = "processing" | "awaiting_email" | "fulfilled" | "error";

function PurchaseCompleteInner() {
  const searchParams = useSearchParams();
  const claim = searchParams.get("claim") ?? "";
  const [state, setState] = useState<PurchaseState>("processing");
  const [plan, setPlan] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (!/^[a-f0-9]{64}$/.test(claim)) {
      setState("error");
      return;
    }

    let stopped = false;
    let attempts = 0;

    const check = async () => {
      try {
        const me = await fetch("/api/me", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (stopped) return;
        if (me?.userId) setHasSession(true);

        if (me?.userId) {
          await fetch("/api/purchase/claim", { method: "POST" }).catch(() => null);
        }

        const response = await fetch(`/api/purchase/status?claim=${encodeURIComponent(claim)}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (stopped) return;

        if (data.plan) setPlan(String(data.plan));

        if (data.status === "fulfilled") {
          setState("fulfilled");
        } else if (data.status === "awaiting_account") {
          // Legacy claims — treat as email step
          setState("awaiting_email");
        } else if (data.status === "checkout_failed" || data.status === "invalid") {
          setState("error");
        } else if (attempts < 30) {
          attempts += 1;
          window.setTimeout(check, 2000);
        } else {
          setState(me?.userId ? "fulfilled" : "awaiting_email");
        }
      } catch {
        if (!stopped && attempts < 30) {
          attempts += 1;
          window.setTimeout(check, 2000);
        }
      }
    };

    check();
    return () => {
      stopped = true;
    };
  }, [claim]);

  const title =
    state === "awaiting_email"
      ? "Check your email"
      : state === "fulfilled"
        ? "You're ready"
        : state === "error"
          ? "We could not verify this purchase"
          : "Confirming your purchase";

  const description =
    state === "awaiting_email"
      ? "We sent a secure Open dashboard link to your checkout email. No password needed."
      : state === "fulfilled"
        ? plan
          ? `Your ${plan} plan and credits are active. Install the panels and start generating.`
          : "Your subscription and credits are active. Install the panels and start generating."
        : state === "error"
          ? "Please use the link in your order email or contact support."
          : "Payment was received. This usually takes only a few seconds.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080808] px-5 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-[#39FF6A]/30 bg-[#39FF6A]/10 text-[#39FF6A]">
          {state === "processing" ? "…" : "✓"}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-white/50">{description}</p>

        {state === "fulfilled" && (
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href={hasSession ? "/dashboard/downloads" : "/sign-in"}
              className="inline-flex items-center justify-center rounded-lg bg-[#39FF6A] px-5 py-3 text-sm font-semibold text-black"
            >
              {hasSession ? "Install panels" : "Open dashboard link"}
            </Link>
            {hasSession && (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-lg border border-white/15 px-5 py-3 text-sm font-medium text-white/80 hover:bg-white/[0.04]"
              >
                Open dashboard
              </Link>
            )}
          </div>
        )}

        {state === "awaiting_email" && (
          <p className="mt-6 text-xs text-white/35">
            Already have a link?{" "}
            <Link href="/sign-in" className="text-[#39FF6A]">
              Request another
            </Link>
          </p>
        )}

        {state === "error" && (
          <Link href="/dashboard/support" className="mt-6 inline-flex text-sm text-[#39FF6A]">
            Contact support
          </Link>
        )}
      </div>
    </main>
  );
}

export default function PurchaseCompletePage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-[#080808] text-white/40 text-sm">
        Confirming your purchase…
      </main>
    }>
      <PurchaseCompleteInner />
    </Suspense>
  );
}
