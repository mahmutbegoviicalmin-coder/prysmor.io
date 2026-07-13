"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState, Suspense } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Image from "next/image";

function PanelAuthContent() {
  const params = useSearchParams();
  const code = params.get("code") ?? "";

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [email, setEmail] = useState("");
  const [magicStatus, setMagicStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [magicMessage, setMagicMessage] = useState("");

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
        setErrorMsg(data.error ?? "Authorization failed");
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  }

  async function onMagicSubmit(e: FormEvent) {
    e.preventDefault();
    setMagicStatus("sending");
    setMagicMessage("");
    const redirect = `/panel-auth?code=${encodeURIComponent(code)}`;
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
      setMagicStatus("sent");
      setMagicMessage("Check your email for a sign-in link. It expires in 30 minutes.");
    } catch (err) {
      setMagicStatus("error");
      setMagicMessage(err instanceof Error ? err.message : "Something went wrong");
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
              Enter your email. We&apos;ll send a one-click link, then bring you back here.
            </p>
            {magicStatus === "sent" ? (
              <p className="text-[13px] text-white/60 text-center leading-relaxed">{magicMessage}</p>
            ) : (
              <form onSubmit={onMagicSubmit} className="flex flex-col gap-4">
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
                  disabled={magicStatus === "sending"}
                  className="w-full rounded-[10px] bg-[#39FF6A] px-5 py-3 text-[14px] font-bold text-[#050505] hover:bg-[#4fff7e] disabled:opacity-60"
                >
                  {magicStatus === "sending" ? "Sending…" : "Email me a link"}
                </button>
                {magicStatus === "error" && (
                  <p className="text-sm text-red-400">{magicMessage}</p>
                )}
              </form>
            )}
          </div>
        ) : status === "success" ? (
          <div className="rounded-[18px] border border-[#39FF6A]/20 bg-[#111113] p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-[#39FF6A]/[0.08] border border-[#39FF6A]/20 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-7 h-7 text-[#39FF6A]" />
            </div>
            <h2 className="text-[20px] font-semibold text-white mb-2">Panel authorized!</h2>
            <p className="text-[13px] text-[#6B7280] leading-relaxed">
              You can close this tab and return to Premiere Pro.<br />
              Your panel is now connected.
            </p>
          </div>
        ) : status === "error" ? (
          <div className="rounded-[18px] border border-red-500/20 bg-[#111113] p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-red-500/[0.08] border border-red-500/20 flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-7 h-7 text-red-400" />
            </div>
            <h2 className="text-[20px] font-semibold text-white mb-2">Authorization failed</h2>
            <p className="text-[13px] text-red-400 mb-5">{errorMsg}</p>
            <button
              onClick={() => { setStatus("idle"); setErrorMsg(""); }}
              className="text-[13px] text-[#39FF6A] hover:underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="rounded-[18px] border border-white/[0.07] bg-[#111113] p-8">
            {code && (
              <div className="flex items-center justify-center mb-6">
                <div className="rounded-[10px] border border-[#39FF6A]/20 bg-[#39FF6A]/[0.05] px-5 py-2.5">
                  <span className="font-mono text-[22px] font-bold text-[#39FF6A] tracking-[0.2em]">
                    {code}
                  </span>
                </div>
              </div>
            )}

            <h2 className="text-[20px] font-semibold text-white text-center mb-1">
              Authorize Premiere Panel
            </h2>
            <p className="text-[13px] text-[#6B7280] text-center leading-relaxed mb-6">
              Signed in as{" "}
              <span className="text-[#D1D5DB] font-medium">{sessionEmail}</span>
              .<br />
              This will link your panel to your Prysmor account.
            </p>

            <button
              onClick={handleAuthorize}
              disabled={status === "loading" || !code}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-[10px] bg-[#39FF6A] text-[#050505] text-[14px] font-bold hover:bg-[#4fff7e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              {status === "loading" ? "Authorizing…" : "Authorize Panel"}
            </button>

            {!code && (
              <p className="mt-3 text-center text-[12px] text-red-400">
                No device code found. Please re-launch auth from the panel.
              </p>
            )}

            <p className="mt-4 text-center text-[11px] text-[#4B5563]">
              This authorization expires in 5 minutes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PanelAuthPage() {
  return (
    <Suspense>
      <PanelAuthContent />
    </Suspense>
  );
}
