"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const PENDING_KEY = "prysmor_pending_checkout";

export default function AuthRedirectPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }

    // Check if there's a pending checkout — if so, go to homepage so PricingSection handles it
    let hasPending = false;
    try {
      hasPending = !!localStorage.getItem(PENDING_KEY);
    } catch { /* storage blocked */ }

    if (hasPending) {
      router.replace("/");
    } else {
      router.replace("/dashboard");
    }
  }, [isLoaded, isSignedIn, router]);

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
