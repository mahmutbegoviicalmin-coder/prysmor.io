"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import Navbar from "@/components/site/Navbar";
import Footer from "@/components/site/Footer";
import RefTracker from "@/components/site/RefTracker";
import AnnouncementBar from "@/components/site/AnnouncementBar";

export default function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const isDashboard = pathname.startsWith("/dashboard");
  const isAuthFlow  = pathname === "/auth-redirect" || pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  const isLanding   = pathname === "/";
  const { isSignedIn, isLoaded, user } = useUser();

  /* Bug 1 fix, keep prysmor_user_id in localStorage in sync with Clerk auth state */
  useEffect(() => {
    if (!isLoaded) return;
    try {
      if (user?.id) {
        localStorage.setItem("prysmor_user_id", user.id);
      } else {
        localStorage.removeItem("prysmor_user_id");
      }
    } catch {
      // localStorage blocked (private mode / storage full)
    }
  }, [isLoaded, user?.id]);

  /* Sync country once per session for any logged-in user */
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    try {
      const key = "prysmor_loc_synced";
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* storage blocked */ }
    fetch("/api/sync-location", { method: "POST" }).catch(() => {});
  }, [isLoaded, isSignedIn]);


  return (
    <>
      <Suspense fallback={null}>
        <RefTracker />
      </Suspense>
      {isLanding && (
        <Suspense fallback={null}>
          <AnnouncementBar />
        </Suspense>
      )}
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
