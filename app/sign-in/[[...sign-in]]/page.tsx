"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { track } from "@/lib/track";

function SignInInner() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect_url")
    || searchParams.get("redirect")
    || "/dashboard";
  const error = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("/api/auth/magic/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, redirect }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not send link");
      }
      setStatus("sent");
      setMessage("Check your email for a sign-in link. It expires in 30 minutes.");
      track("sign_in_submit", { status: "sent" });
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
      track("sign_in_submit", { status: "error" });
    }
  };

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
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to Prysmor</h1>
          <p className="mt-2 text-sm text-white/45">
            Enter the email you used at checkout. We&apos;ll send a one-click link. No password.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          {error === "invalid" && (
            <p className="mb-4 text-sm text-[#F87171]">That link is invalid or expired.</p>
          )}
          {error === "used" && (
            <p className="mb-4 text-sm text-[#F87171]">That link was already used. Request a new one.</p>
          )}

          {status === "sent" ? (
            <p className="text-sm leading-6 text-white/60">{message}</p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <label className="block text-left">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#3a3a42]">
                  Email
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-[10px] border border-[#232328] bg-[#0e0e10] px-3.5 py-3 text-sm text-white outline-none focus:border-[#39FF6A]/40"
                  placeholder="you@email.com"
                  autoComplete="email"
                />
              </label>
              <button
                type="submit"
                disabled={status === "sending"}
                className="rounded-[10px] bg-gradient-to-br from-[#44ff74] to-[#22c24a] px-5 py-3 text-[13px] font-bold uppercase tracking-[0.06em] text-[#040e06] disabled:opacity-60"
              >
                {status === "sending" ? "Sending…" : "Email me a link"}
              </button>
              {status === "error" && (
                <p className="text-sm text-[#F87171]">{message}</p>
              )}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-[#080808] text-white/40 text-sm">
        Loading…
      </main>
    }>
      <SignInInner />
    </Suspense>
  );
}
