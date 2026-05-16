"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";

export default function AuthRedirectPage() {
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      window.location.replace("/sign-in");
      return;
    }

    // Go to homepage and scroll to pricing — PricingSection handles pending checkout automatically
    window.location.replace("/#pricing");
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
