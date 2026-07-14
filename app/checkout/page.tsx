"use client";

import { FormEvent, useEffect, useState } from "react";
import { getMetaClickIds } from "@/lib/pixel";

declare global {
  interface Window {
    LemonSqueezy?: {
      Url: { Open: (url: string) => void };
    };
    createLemonSqueezy?: () => void;
  }
}

/**
 * Fallback /checkout route — requires email before opening Lemon.
 */
export default function CheckoutPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"loading" | "form" | "opening" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetch("/api/me", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
        if (cancelled) return;
        if (me?.email) {
          setEmail(String(me.email));
          await startCheckout(String(me.email));
          return;
        }
        setStatus("form");
      } catch {
        if (!cancelled) setStatus("form");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCheckout(checkoutEmail: string) {
    setStatus("opening");
    setError("");
    try {
      const meta = getMetaClickIds();
      const response = await fetch("/api/checkout/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: checkoutEmail, ...meta }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || "Checkout unavailable");

      if (window.LemonSqueezy?.Url?.Open) {
        window.LemonSqueezy.Url.Open(data.url);
      } else if (window.createLemonSqueezy) {
        window.createLemonSqueezy();
        window.LemonSqueezy?.Url?.Open(data.url);
      } else {
        window.location.href = data.url;
      }
      // Keep a link if overlay closes without paying
      setStatus("form");
      setEmail(checkoutEmail);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Checkout failed");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await startCheckout(email.trim());
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080808] px-5 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="text-xl font-semibold tracking-tight">Checkout</h1>
        <p className="mt-2 text-sm text-white/45">
          Enter the email for your license. We&apos;ll send your password setup link there after payment.
        </p>

        {status === "loading" || status === "opening" ? (
          <p className="mt-6 text-sm text-white/50">
            {status === "opening" ? "Opening secure checkout…" : "Loading…"}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="w-full rounded-[10px] border border-[#232328] bg-[#0e0e10] px-3.5 py-3 text-sm text-white outline-none focus:border-[#39FF6A]/40"
              autoComplete="email"
            />
            <button
              type="submit"
              className="rounded-[10px] bg-[#39FF6A] px-5 py-3 text-[13px] font-bold uppercase tracking-[0.06em] text-black"
            >
              Continue to payment
            </button>
            {(status === "error" || error) && (
              <p className="text-sm text-[#F87171]">{error}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
