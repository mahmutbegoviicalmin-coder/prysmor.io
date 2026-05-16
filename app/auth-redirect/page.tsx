"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";

const PENDING_KEY = "prysmor_pending_checkout";

export default function AuthRedirectPage() {
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      window.location.replace("/sign-in");
      return;
    }

    // Came from pricing CTA → back to pricing; normal login → dashboard
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
