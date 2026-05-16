"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import Navbar from "@/components/site/Navbar";
import Footer from "@/components/site/Footer";
import RefTracker from "@/components/site/RefTracker";
import AnnouncementBar from "@/components/site/AnnouncementBar";
import { track } from "@/lib/track";

const PENDING_KEY = "prysmor_pending_checkout";

export default function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const isDashboard = pathname.startsWith("/dashboard");
  const isLanding   = pathname === "/";
  const { isSignedIn, isLoaded, user } = useUser();

  /* Bug 1 fix — keep prysmor_user_id in localStorage in sync with Clerk auth state */
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

  /* Bug 2 fix — track sign_up only once, only for accounts created < 5 min ago */
  useEffect(() => {
    if (!isLoaded || !user?.id) return;
    try {
      const storageKey = `prysmor_signed_up_${user.id}`;
      if (localStorage.getItem(storageKey)) return;
      // Always mark to avoid repeated checks on every visit
      localStorage.setItem(storageKey, "true");
      const createdAt   = user.createdAt ? new Date(user.createdAt) : null;
      const diffMinutes = createdAt ? (Date.now() - createdAt.getTime()) / 60_000 : 999;
      if (diffMinutes < 5) {
        track("sign_up", {
          method:  (user.externalAccounts?.length ?? 0) > 0 ? "google_oauth" : "email",
          userId:  user.id,
        });
      }
    } catch {
      // localStorage blocked (private mode / storage full)
    }
  }, [isLoaded, user?.id]);

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
      {!isDashboard && (
        <Suspense fallback={null}>
          <Navbar />
        </Suspense>
      )}
      <main>{children}</main>
      {!isDashboard && (
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      )}
    </>
  );
}
