"use client";

import { SignUp, useAuth } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const appearance = {
  variables: {
    colorPrimary: "#39FF6A",
    colorBackground: "#111113",
    colorInputBackground: "#0e0e10",
    colorInputText: "#ffffff",
    colorText: "#ffffff",
    colorTextSecondary: "#555",
    colorNeutral: "#ffffff",
    colorDanger: "#F87171",
    colorSuccess: "#39FF6A",
    borderRadius: "10px",
    fontFamily: "var(--font-outfit), system-ui, sans-serif",
    fontSize: "14px",
  },
  elements: {
    header: { display: "none" },
    headerTitle: { display: "none" },
    headerSubtitle: { display: "none" },
    card: {
      background: "transparent",
      border: "none",
      boxShadow: "none",
      padding: "0",
      width: "100%",
    },
    cardBox: { boxShadow: "none", width: "100%" },
    rootBox: { width: "100%" },
    socialButtonsBlockButton: {
      background: "#111113",
      border: "1px solid #232328",
      color: "#aaa",
      borderRadius: "10px",
      fontSize: "13px",
      fontWeight: "500",
      padding: "11px 20px",
      transition: "all 200ms",
    },
    socialButtonsBlockButtonText: { color: "#aaa", fontWeight: "500" },
    dividerLine: { background: "#1d1d22" },
    dividerText: { color: "#2d2d32", fontSize: "11px" },
    formFieldLabel: {
      color: "#3a3a42",
      fontSize: "11px",
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
    },
    formFieldInput: {
      background: "#0e0e10",
      border: "1px solid #232328",
      borderRadius: "10px",
      color: "#fff",
      fontSize: "14px",
      padding: "11px 14px",
      outline: "none",
    },
    formFieldInputShowPasswordButton: { color: "#444" },
    formButtonPrimary: {
      background: "linear-gradient(135deg, #44ff74 0%, #22c24a 100%)",
      color: "#040e06",
      fontWeight: "700",
      fontSize: "13px",
      letterSpacing: "0.06em",
      borderRadius: "10px",
      textTransform: "uppercase",
      padding: "13px 20px",
      boxShadow: "0 4px 20px rgba(57,255,106,0.25)",
    },
    footerActionLink: { color: "#39FF6A" },
    identityPreviewEditButton: { color: "#39FF6A" },
    formResendCodeLink: { color: "#39FF6A" },
    identityPreviewText: { color: "#666" },
    badge: { display: "none" },
    footerPages: { display: "none" },
    footer: {
      background: "transparent",
      border: "none",
      borderTop: "1px solid #1a1a1f",
      marginTop: "8px",
      paddingTop: "16px",
    },
    footerActionText: { color: "#444", fontSize: "12px" },
  },
};

type ClaimStatus = "loading" | "awaiting_account" | "fulfilled" | "invalid" | "error";

export default function ActivatePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const purchase = searchParams.get("purchase") ?? "";
  const ticket = searchParams.get("__clerk_ticket");
  const [status, setStatus] = useState<ClaimStatus>("loading");
  const [fulfilledForCurrentUser, setFulfilledForCurrentUser] = useState(false);

  const claimValid = /^[a-f0-9]{64}$/.test(purchase);
  const afterActivate = claimValid
    ? `/auth-redirect?purchase=${encodeURIComponent(purchase)}`
    : "/auth-redirect";

  useEffect(() => {
    if (!claimValid) {
      setStatus("invalid");
      return;
    }

    let stopped = false;
    const load = async () => {
      try {
        const response = await fetch(
          `/api/purchase/status?claim=${encodeURIComponent(purchase)}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (stopped) return;
        if (data.status === "fulfilled") {
          setStatus("fulfilled");
          setFulfilledForCurrentUser(data.fulfilledForCurrentUser === true);
        } else if (data.status === "awaiting_account") {
          setStatus("awaiting_account");
        } else {
          setStatus("invalid");
        }
      } catch {
        if (!stopped) setStatus("error");
      }
    };
    load();
    return () => {
      stopped = true;
    };
  }, [claimValid, purchase]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !claimValid) return;
    router.replace(`/purchase/complete?claim=${encodeURIComponent(purchase)}`);
  }, [isLoaded, isSignedIn, claimValid, purchase, router]);

  if (!claimValid || status === "invalid") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080808] px-5 text-white">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Invalid activation link</h1>
          <p className="mt-3 text-sm text-white/50">
            Use the Activate account button in your Prysmor order email, or contact support.
          </p>
          <Link href="/dashboard/support" className="mt-6 inline-flex text-sm text-[#39FF6A]">
            Contact support
          </Link>
        </div>
      </main>
    );
  }

  if (status === "fulfilled" && !ticket) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080808] px-5 text-white">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Account already activated</h1>
          <p className="mt-3 text-sm leading-6 text-white/50">
            Your purchase is linked. Open the dashboard to install panels and start generating.
          </p>
          <Link
            href={fulfilledForCurrentUser || isSignedIn ? "/dashboard" : "/sign-in?redirect_url=/dashboard"}
            className="mt-6 inline-flex rounded-lg bg-[#39FF6A] px-5 py-3 text-sm font-semibold text-black"
          >
            Open dashboard
          </Link>
        </div>
      </main>
    );
  }

  if (status === "loading" || !isLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080808] px-5 text-white">
        <p className="text-sm text-white/40">Loading activation…</p>
      </main>
    );
  }

  if (isSignedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080808] px-5 text-white">
        <p className="text-sm text-white/40">Taking you to your purchase…</p>
      </main>
    );
  }

  if (!ticket) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080808] px-5 text-white">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-3 text-sm leading-6 text-white/50">
            Open the Prysmor order email and click <strong className="text-white">Activate account</strong>.
            That link verifies your checkout email so you only need to create a password.
          </p>
          <Link href="/dashboard/support" className="mt-6 inline-flex text-sm text-[#39FF6A]">
            Need help?
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080808] px-5 py-16 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% -10%, rgba(57,255,106,0.12), transparent 55%)",
        }}
      />
      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/logo/vecilogo.png"
            alt="Prysmor"
            width={36}
            height={36}
            className="mb-4 object-contain"
          />
          <h1 className="text-2xl font-semibold tracking-tight">Activate your Prysmor account</h1>
          <p className="mt-2 text-sm text-white/45">
            Your email is verified. Create a password once to finish setup.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <SignUp
            appearance={appearance}
            forceRedirectUrl={afterActivate}
            fallbackRedirectUrl={afterActivate}
            routing="hash"
          />
        </div>
      </div>
    </main>
  );
}
