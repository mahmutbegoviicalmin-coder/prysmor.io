"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Navbar from "@/components/site/Navbar";
import Footer from "@/components/site/Footer";
import RefTracker from "@/components/site/RefTracker";

export default function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const isDashboard = pathname.startsWith("/dashboard");
  const isAuthFlow  = pathname === "/auth-redirect"
    || pathname === "/activate"
    || pathname.startsWith("/purchase/")
    || pathname.startsWith("/sign-in")
    || pathname.startsWith("/sign-up")
    || pathname === "/sign-out"
    || pathname.startsWith("/set-password")
    || pathname.startsWith("/forgot-password")
    || pathname.startsWith("/panel-auth");
  const [userId, setUserId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const id = d?.userId ? String(d.userId) : null;
        setUserId(id);
        try {
          if (id) localStorage.setItem("prysmor_user_id", id);
          else localStorage.removeItem("prysmor_user_id");
        } catch { /* storage blocked */ }
      })
      .catch(() => {
        if (!cancelled) setUserId(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    if (!loaded || !userId) return;
    try {
      const key = "prysmor_loc_synced";
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* storage blocked */ }
    fetch("/api/sync-location", { method: "POST" }).catch(() => {});
  }, [loaded, userId]);

  return (
    <>
      <Suspense fallback={null}>
        <RefTracker />
      </Suspense>
      {!isDashboard && !isAuthFlow && (
        <Suspense fallback={null}>
          <Navbar />
        </Suspense>
      )}
      <main>{children}</main>
      {!isDashboard && !isAuthFlow && (
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      )}
    </>
  );
}
