"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type PurchaseState = "processing" | "awaiting_account" | "fulfilled" | "error";

export default function PurchaseCompletePage() {
  const searchParams = useSearchParams();
  const claim = searchParams.get("claim") ?? "";
  const [state, setState] = useState<PurchaseState>("processing");
  const [isCurrentUser, setIsCurrentUser] = useState(false);

  useEffect(() => {
    if (!/^[a-f0-9]{64}$/.test(claim)) {
      setState("error");
      return;
    }

    let stopped = false;
    let attempts = 0;
    const check = async () => {
      try {
        const response = await fetch(`/api/purchase/status?claim=${encodeURIComponent(claim)}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (stopped) return;
        if (data.status === "awaiting_account") setState("awaiting_account");
        else if (data.status === "fulfilled") {
          setState("fulfilled");
          setIsCurrentUser(data.fulfilledForCurrentUser === true);
        } else if (data.status === "checkout_failed" || data.status === "invalid") {
          setState("error");
        } else if (attempts < 30) {
          attempts += 1;
          window.setTimeout(check, 2000);
        } else {
          setState("processing");
        }
      } catch {
        if (!stopped && attempts < 30) {
          attempts += 1;
          window.setTimeout(check, 2000);
        }
      }
    };
    check();
    return () => { stopped = true; };
  }, [claim]);

  const title = state === "awaiting_account"
    ? "Check your email"
    : state === "fulfilled"
      ? "Prysmor is ready"
      : state === "error"
        ? "We could not verify this purchase"
        : "Confirming your purchase";
  const description = state === "awaiting_account"
    ? "We sent a secure activation link to the email used at checkout."
    : state === "fulfilled"
      ? "Your subscription and credits have been added to your account."
      : state === "error"
        ? "Please use the link in your Lemon Squeezy receipt or contact support."
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
          <Link
            href={isCurrentUser ? "/dashboard" : "/sign-in?redirect_url=/dashboard"}
            className="mt-6 inline-flex rounded-lg bg-[#39FF6A] px-5 py-3 text-sm font-semibold text-black"
          >
            Open dashboard
          </Link>
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
