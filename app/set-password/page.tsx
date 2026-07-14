"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

function SetPasswordInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  const tokenOk = useMemo(() => token.includes("."), [token]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setStatus("error");
      setMessage("Passwords do not match.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not set password");
      }
      router.replace("/dashboard");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
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
          <h1 className="text-2xl font-semibold tracking-tight">Choose your password</h1>
          <p className="mt-2 text-sm text-white/45">
            This activates your Prysmor account for the web dashboard and Premiere / After Effects panels.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          {!tokenOk ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-[#F87171]">This link is missing or invalid.</p>
              <Link href="/forgot-password" className="text-sm text-[#39FF6A] hover:underline">
                Request a new password link
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <label className="block text-left">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#3a3a42]">
                  Password
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-[10px] border border-[#232328] bg-[#0e0e10] px-3.5 py-3 text-sm text-white outline-none focus:border-[#39FF6A]/40"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </label>
              <label className="block text-left">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#3a3a42]">
                  Confirm password
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-[10px] border border-[#232328] bg-[#0e0e10] px-3.5 py-3 text-sm text-white outline-none focus:border-[#39FF6A]/40"
                  placeholder="Repeat password"
                  autoComplete="new-password"
                />
              </label>
              <button
                type="submit"
                disabled={status === "loading"}
                className="rounded-[10px] bg-gradient-to-br from-[#44ff74] to-[#22c24a] px-5 py-3 text-[13px] font-bold uppercase tracking-[0.06em] text-[#040e06] disabled:opacity-60"
              >
                {status === "loading" ? "Saving…" : "Save password & continue"}
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

export default function SetPasswordPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-[#080808] text-white/40 text-sm">
        Loading…
      </main>
    }>
      <SetPasswordInner />
    </Suspense>
  );
}
