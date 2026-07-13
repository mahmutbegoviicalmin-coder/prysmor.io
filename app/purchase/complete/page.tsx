"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type PurchaseState = "processing" | "awaiting_account" | "fulfilled" | "error";

export default function PurchaseCompletePage() {
  const searchParams = useSearchParams();
  const claim = searchParams.get("claim") ?? "";
  const { isLoaded, isSignedIn } = useAuth();
  const [state, setState] = useState<PurchaseState>("processing");
  const [isCurrentUser, setIsCurrentUser] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    if (!/^[a-f0-9]{64}$/.test(claim)) {
      setState("error");
      return;
    }

    let stopped = false;
    let attempts = 0;

    const check = async () => {
      try {
        if (isSignedIn) {
          await fetch("/api/purchase/claim", { method: "POST" }).catch(() => null);
        }

        const response = await fetch(`/api/purchase/status?claim=${encodeURIComponent(claim)}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (stopped) return;

        if (data.plan) setPlan(String(data.plan));

        if (data.status === "awaiting_account") {
          setState("awaiting_account");
        } else if (data.status === "fulfilled") {
          setState("fulfilled");
          setIsCurrentUser(data.fulfilledForCurrentUser === true);
        } else if (data.status === "checkout_failed" || data.status === "invalid") {
          setState("error");
        } else if (attempts < 30) {
          attempts += 1;
          window.setTimeout(check, 2000);
        } else {
          setState(isSignedIn ? "processing" : "awaiting_account");
        }
      } catch {
        if (!stopped && attempts < 30) {
          attempts += 1;
          window.setTimeout(check, 2000);
        }
      }
    };

    if (!isLoaded) return;
    check();
    return () => {
      stopped = true;
    };
  }, [claim, isLoaded, isSignedIn]);

  const title =
    state === "awaiting_account"
      ? "Check your email to activate"
      : state === "fulfilled"
        ? "You're ready"
        : state === "error"
          ? "We could not verify this purchase"
          : "Confirming your purchase";

  const description =
    state === "awaiting_account"
      ? "We sent a Prysmor order email with an Activate account button. Create a password once, then you'll land here ready to install."
      : state === "fulfilled"
        ? plan
          ? `Your ${plan} plan and credits are active. Install the panels and start generating in Premiere Pro or After Effects.`
          : "Your subscription and credits are active. Install the panels and start generating in Premiere Pro or After Effects."
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
              href={isCurrentUser || isSignedIn ? "/dashboard/downloads" : "/sign-in?redirect_url=/dashboard/downloads"}
              className="inline-flex items-center justify-center rounded-lg bg-[#39FF6A] px-5 py-3 text-sm font-semibold text-black"
            >
              Install panels
            </Link>
            <Link
              href={isCurrentUser || isSignedIn ? "/dashboard" : "/sign-in?redirect_url=/dashboard"}
              className="inline-flex items-center justify-center rounded-lg border border-white/15 px-5 py-3 text-sm font-medium text-white/80 hover:bg-white/[0.04]"
            >
              Open dashboard
            </Link>
          </div>
        )}

        {state === "awaiting_account" && /^[a-f0-9]{64}$/.test(claim) && (
          <p className="mt-6 text-xs text-white/35">
            Already activated?{" "}
            <Link
              href={`/sign-in?redirect_url=${encodeURIComponent(`/purchase/complete?claim=${claim}`)}`}
              className="text-[#39FF6A]"
            >
              Sign in
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
