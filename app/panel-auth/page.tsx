"use client";

import { useUser, SignIn } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { Sparkles, CheckCircle2, XCircle, Loader2 } from "lucide-react";

function PanelAuthContent() {
  const { user, isLoaded } = useUser();
  const params = useSearchParams();
  const code = params.get("code") ?? "";

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

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

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#09090B]">
        <Loader2 className="w-6 h-6 text-[#A3FF12] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090B] flex items-center justify-center px-4">
      {/* Background glow */}
      <div
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px] opacity-20"
        style={{ background: "radial-gradient(ellipse, #A3FF12 0%, transparent 70%)" }}
      />

      <div className="relative w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #A3FF12 0%, #22FFB0 100%)" }}
          >
            <Sparkles className="w-4 h-4 text-[#050505]" />
          </div>
          <span className="text-[18px] font-semibold text-white tracking-tight">Prysmor</span>
        </div>

        {!user ? (
          /* ── Not signed in — show Clerk sign-in ── */
          <div>
            <p className="text-center text-[14px] text-[#6B7280] mb-6">
              Sign in to authorize the Premiere Pro panel.
            </p>
            <SignIn
              afterSignInUrl={`/panel-auth?code=${code}`}
              appearance={{
                variables: {
                  colorBackground: "#111113",
                  colorText: "#F9FAFB",
                  colorPrimary: "#A3FF12",
                  colorInputBackground: "#1A1A1C",
                  colorInputText: "#F9FAFB",
                  borderRadius: "10px",
                },
                elements: {
                  card: "border border-white/[0.07] shadow-none",
                  headerTitle: "text-white",
                  headerSubtitle: "text-[#6B7280]",
                  formButtonPrimary: "bg-[#A3FF12] text-[#050505] hover:bg-[#B6FF3C] font-semibold",
                  footerActionLink: "text-[#A3FF12] hover:text-[#B6FF3C]",
                },
              }}
            />
          </div>
        ) : status === "success" ? (
          /* ── Success ── */
          <div className="rounded-[18px] border border-[#A3FF12]/20 bg-[#111113] p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-[#A3FF12]/[0.08] border border-[#A3FF12]/20 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-7 h-7 text-[#A3FF12]" />
            </div>
            <h2 className="text-[20px] font-semibold text-white mb-2">Panel authorized!</h2>
            <p className="text-[13px] text-[#6B7280] leading-relaxed">
              You can close this tab and return to Premiere Pro.<br />
              Your panel is now connected.
            </p>
          </div>
        ) : status === "error" ? (
          /* ── Error ── */
          <div className="rounded-[18px] border border-red-500/20 bg-[#111113] p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-red-500/[0.08] border border-red-500/20 flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-7 h-7 text-red-400" />
            </div>
            <h2 className="text-[20px] font-semibold text-white mb-2">Authorization failed</h2>
            <p className="text-[13px] text-red-400 mb-5">{errorMsg}</p>
            <button
              onClick={() => { setStatus("idle"); setErrorMsg(""); }}
              className="text-[13px] text-[#A3FF12] hover:underline"
            >
              Try again
            </button>
          </div>
        ) : (
          /* ── Authorize prompt ── */
          <div className="rounded-[18px] border border-white/[0.07] bg-[#111113] p-8">
            {/* Code display */}
            {code && (
              <div className="flex items-center justify-center mb-6">
                <div className="rounded-[10px] border border-[#A3FF12]/20 bg-[#A3FF12]/[0.05] px-5 py-2.5">
                  <span className="font-mono text-[22px] font-bold text-[#A3FF12] tracking-[0.2em]">
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
              <span className="text-[#D1D5DB] font-medium">
                {user.primaryEmailAddress?.emailAddress}
              </span>
              .<br />
              This will link your panel to your Prysmor account.
            </p>

            <button
              onClick={handleAuthorize}
              disabled={status === "loading" || !code}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-[10px] bg-[#A3FF12] text-[#050505] text-[14px] font-bold hover:bg-[#B6FF3C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
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
