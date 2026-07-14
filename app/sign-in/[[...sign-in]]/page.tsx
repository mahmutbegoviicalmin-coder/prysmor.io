"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { track } from "@/lib/track";

function SignInInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirect = searchParams.get("redirect_url")
    || searchParams.get("redirect")
    || "/dashboard";
  const error = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not sign in");
      }
      track("sign_in_ok");
      const dest = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";
      router.replace(dest);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
      track("sign_in_error");
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
            Use the email from checkout and the password you chose after purchase.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          {error === "invalid" && (
            <p className="mb-4 text-sm text-[#F87171]">That link is invalid or expired.</p>
          )}
          {error === "used" && (
            <p className="mb-4 text-sm text-[#F87171]">That link was already used. Request a new one via Forgot password.</p>
          )}
          {error === "use_password" && (
            <p className="mb-4 text-sm text-[#F87171]">Sign in with your email and password.</p>
          )}
          {error === "no_account" && (
            <p className="mb-4 text-sm text-[#F87171]">No account for that link. Buy a plan first.</p>
          )}

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
            <label className="block text-left">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#3a3a42]">
                Password
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[10px] border border-[#232328] bg-[#0e0e10] px-3.5 py-3 text-sm text-white outline-none focus:border-[#39FF6A]/40"
                placeholder="Your password"
                autoComplete="current-password"
                minLength={8}
              />
            </label>
            <button
              type="submit"
              disabled={status === "loading"}
              className="rounded-[10px] bg-gradient-to-br from-[#44ff74] to-[#22c24a] px-5 py-3 text-[13px] font-bold uppercase tracking-[0.06em] text-[#040e06] disabled:opacity-60"
            >
              {status === "loading" ? "Signing in…" : "Sign in"}
            </button>
            {status === "error" && (
              <p className="text-sm text-[#F87171]">{message}</p>
            )}
          </form>

          <div className="mt-5 flex flex-col gap-2 text-center text-[12px] text-white/40">
            <Link href="/forgot-password" className="text-[#39FF6A] hover:underline">
              Forgot password / set password
            </Link>
            <p>
              No account yet?{" "}
              <Link href="/#pricing" className="text-white/70 hover:text-white">
                Buy a plan
              </Link>
            </p>
          </div>
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
