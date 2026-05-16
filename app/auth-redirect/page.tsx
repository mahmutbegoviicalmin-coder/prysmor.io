"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AuthRedirectPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }

    // Always go to homepage after auth — pricing section is visible,
    // and PricingSection handles pending checkout automatically
    router.replace("/");
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
