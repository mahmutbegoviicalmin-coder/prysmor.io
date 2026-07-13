"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function MagicAuthInner() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    const redirect = searchParams.get("redirect") ?? "/dashboard";
    if (!token) {
      setError("Missing sign-in link.");
      return;
    }
    const qs = new URLSearchParams({ token, redirect });
    window.location.replace(`/api/auth/magic/consume?${qs.toString()}`);
  }, [searchParams]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080808] px-5 text-white">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Could not sign in</h1>
          <p className="mt-3 text-sm text-white/50">{error}</p>
          <a href="/sign-in" className="mt-6 inline-flex text-sm text-[#39FF6A]">
            Request a new link
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080808] px-5 text-white">
      <p className="text-sm text-white/40">Signing you in…</p>
    </main>
  );
}

export default function MagicAuthPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-[#080808] text-white/40 text-sm">
        Signing you in…
      </main>
    }>
      <MagicAuthInner />
    </Suspense>
  );
}
