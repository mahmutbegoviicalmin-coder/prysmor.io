'use client';

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

const MAX_RETRIES = 10;   // 10 × 500ms = 5s max wait
const RETRY_MS   = 500;

export default function AuthRedirectPage() {
  const { user, isLoaded } = useUser();
  const router  = useRouter();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isLoaded) return;

    if (user) {
      router.replace("/dashboard");
      return;
    }

    // Session not yet established — keep retrying for up to 5s
    if (tick < MAX_RETRIES) {
      const id = setTimeout(() => setTick(t => t + 1), RETRY_MS);
      return () => clearTimeout(id);
    }

    // Timed out — go to sign-in
    router.replace("/sign-in");
  }, [user, isLoaded, router, tick]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080808",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{
        width: "32px",
        height: "32px",
        borderRadius: "50%",
        border: "2px solid #1a1a1a",
        borderTopColor: "#39FF6A",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
