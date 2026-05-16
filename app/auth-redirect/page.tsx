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

    // If user came from pricing CTA (pending checkout exists) → go to pricing
    // Otherwise → go to dashboard (existing user normal login)
    const hasPendingCheckout = !!localStorage.getItem(PENDING_KEY);
    window.location.replace(hasPendingCheckout ? "/#pricing" : "/dashboard");
  }, [isLoaded, isSignedIn]);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "#080808",
    }}>
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
