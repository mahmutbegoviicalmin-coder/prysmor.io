"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState, Suspense } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

function PanelAuthContent() {
  const params = useSearchParams();
  const code = params.get("code") ?? "";

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginStatus, setLoginStatus] = useState<"idle" | "loading" | "error">("idle");
  const [loginMessage, setLoginMessage] = useState("");

  function loadSession() {
    return fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setSessionEmail(d?.email ? String(d.email) : null);
      })
      .catch(() => setSessionEmail(null))
      .finally(() => setSessionLoaded(true));
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setSessionEmail(d?.email ? String(d.email) : null);
      })
      .catch(() => {
        if (!cancelled) setSessionEmail(null);
      })
      .finally(() => {
        if (!cancelled) setSessionLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  async function handleAuthorize() {
    setStatus("loading");
    try {
      const res = await fetch("/api/panel/auth/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message ?? data.error ?? "Authorization failed");
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  }

  async function onLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setLoginStatus("loading");
    setLoginMessage("");
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
      setSessionLoaded(false);
      await loadSession();
      setLoginStatus("idle");
    } catch (err) {
      setLoginStatus("error");
      setLoginMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (!sessionLoaded) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center px-4">
        <div className="w-full max-w-[400px]">
          <div className="flex items-center justify-center gap-2.5 mb-8">
            <Image src="/logo/logo-icon.png" alt="Prysmor" width={32} height={32} className="rounded-[8px]" />
            <span className="text-[18px] font-semibold text-white tracking-tight">Prysmor</span>
          </div>
          <div className="rounded-[18px] border border-white/[0.07] bg-[#111113] p-8 flex flex-col items-center gap-4">
            <Loader2 className="w-6 h-6 text-[#A3FF12] animate-spin" />
            <p className="text-[13px] text-[#6B7280]">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090B] flex items-center justify-center px-4">
      <div
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px] opacity-20"
        style={{ background: "radial-gradient(ellipse, #39FF6A 0%, transparent 70%)" }}
      />

      <div className="relative w-full max-w-[400px]">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <Image src="/logo/logo-icon.png" alt="Prysmor" width={32} height={32} className="rounded-[8px]" />
          <span className="text-[18px] font-semibold text-white tracking-tight">Prysmor</span>
        </div>

        {!sessionEmail ? (
          <div className="rounded-[18px] border border-white/[0.07] bg-[#111113] p-8">
            <h2 className="text-[20px] font-semibold text-white text-center mb-1">
              Sign in to authorize
            </h2>
            <p className="text-[13px] text-[#6B7280] text-center leading-relaxed mb-6">
              Sign in with your Prysmor email and password to connect this panel.
            </p>
            {!code && (
              <p className="mb-4 text-[12px] text-red-400 text-center">Missing pairing code from the panel.</p>
            )}
            <form onSubmit={onLoginSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Checkout email"
                className="w-full rounded-[10px] border border-white/[0.08] bg-[#0e0e10] px-3.5 py-2.5 text-[13px] text-white outline-none focus:border-[#39FF6A]/40"
                autoComplete="email"
              />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-[10px] border border-white/[0.08] bg-[#0e0e10] px-3.5 py-2.5 text-[13px] text-white outline-none focus:border-[#39FF6A]/40"
                autoComplete="current-password"
              />
              <button
                type="submit"
                disabled={loginStatus === "loading" || !code}
                className="rounded-[10px] bg-[#39FF6A] px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide text-black disabled:opacity-50"
              >
                {loginStatus === "loading" ? "Signing in…" : "Sign in"}
              </button>
              {loginStatus === "error" && (
                <p className="text-[12px] text-red-400 text-center">{loginMessage}</p>
              )}
            </form>
            <p className="mt-4 text-center text-[11px] text-[#6B7280]">
              <Link href="/forgot-password" className="text-[#39FF6A] hover:underline">
                Forgot or set password
              </Link>
            </p>
          </div>
        ) : status === "success" ? (
          <div className="rounded-[18px] border border-white/[0.07] bg-[#111113] p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-[#A3FF12] mx-auto mb-4" />
            <h2 className="text-[18px] font-semibold text-white mb-2">Panel authorized</h2>
            <p className="text-[13px] text-[#6B7280] leading-relaxed">
              You can return to Premiere Pro or After Effects. The panel should connect automatically.
            </p>
          </div>
        ) : status === "error" ? (
          <div className="rounded-[18px] border border-white/[0.07] bg-[#111113] p-8 text-center">
            <XCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
            <h2 className="text-[18px] font-semibold text-white mb-2">Authorization failed</h2>
            <p className="text-[13px] text-[#6B7280] leading-relaxed mb-4">{errorMsg}</p>
            <button
              onClick={() => { setStatus("idle"); setErrorMsg(""); }}
              className="text-[12px] text-[#39FF6A] hover:underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="rounded-[18px] border border-white/[0.07] bg-[#111113] p-8">
            <h2 className="text-[20px] font-semibold text-white text-center mb-1">
              Authorize panel
            </h2>
            <p className="text-[13px] text-[#6B7280] text-center leading-relaxed mb-2">
              Signed in as <span className="text-white">{sessionEmail}</span>
            </p>
            <p className="text-[12px] text-[#4B5563] text-center mb-6 font-mono tracking-widest">
              {code || "NO CODE"}
            </p>
            <button
              onClick={handleAuthorize}
              disabled={status === "loading" || !code}
              className="w-full rounded-[10px] bg-[#39FF6A] px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-black disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Authorizing…
                </>
              ) : (
                "Authorize Panel"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PanelAuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center text-[#6B7280] text-sm">
        Loading…
      </div>
    }>
      <PanelAuthContent />
    </Suspense>
  );
}
