"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import Navbar from "@/components/site/Navbar";
import Footer from "@/components/site/Footer";
import RefTracker from "@/components/site/RefTracker";
import AnnouncementBar from "@/components/site/AnnouncementBar";

export default function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname();
  const isDashboard = pathname.startsWith("/dashboard");
  const isLanding  = pathname === "/";
  const { isSignedIn, isLoaded } = useUser();

  /* Sync country once per session for any logged-in user */
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const key = "prysmor_loc_synced";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    fetch("/api/sync-location", { method: "POST" }).catch(() => {});
  }, [isLoaded, isSignedIn]);

  return (
    <>
      <Suspense fallback={null}>
        <RefTracker />
      </Suspense>
      {isLanding && <AnnouncementBar />}
      {!isDashboard && <Navbar />}
      <main>{children}</main>
      {!isDashboard && <Footer />}
    </>
  );
}
