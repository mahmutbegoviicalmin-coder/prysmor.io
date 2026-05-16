"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

const PENDING_KEY = "prysmor_pending_checkout";

export default function AuthRedirectPage() {
  const { isLoaded, isSignedIn } = useUser();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hard timeout: if Clerk doesn't initialise in 5s the session is corrupt → clear and restart
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      window.location.replace("/sign-out");
    }, 5000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    // Cancel the timeout — Clerk loaded successfully
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!isSignedIn) {
      window.location.replace("/sign-in");
      return;
    }

    // Pricing CTA flow → back to pricing; normal login → dashboard
    const hasPendingCheckout = !!localStorage.getItem(PENDING_KEY);
    window.location.replace(hasPendingCheckout ? "/#pricing" : "/dashboard");
  }, [isLoaded, isSignedIn]);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "16px",
      minHeight: "100vh",
      background: "#080808",
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/logo-icon.png" alt="Prysmor" width={28} height={28} style={{ opacity: 0.4 }} />
      <div style={{
        width: "28px",
        height: "28px",
        borderRadius: "50%",
        border: "2px solid #1a1a1a",
        borderTopColor: "#39FF6A",
        animation: "spin 0.7s linear infinite",
      }} />
    </div>
  );
}
