"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

const MAX_RETRIES = 6;   // 6 × 400ms = ~2.4s max wait
const RETRY_MS   = 400;

export default function AuthRedirectPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isLoaded) return;

    if (user) {
      const createdAt = user.createdAt ? new Date(user.createdAt) : null;
      const isNew = createdAt !== null && Date.now() - createdAt.getTime() < 5 * 60_000;
      router.replace(isNew ? "/dashboard/playground" : "/dashboard");
      return;
    }

    if (tick < MAX_RETRIES) {
      const id = setTimeout(() => setTick((t) => t + 1), RETRY_MS);
      return () => clearTimeout(id);
    }

    router.replace("/sign-in");
  }, [user, isLoaded, router, tick]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080808",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
      }}
    >
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          border: "2px solid #2a2a2a",
          borderTopColor: "#39FF6A",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <p style={{ margin: 0, fontSize: "13px", color: "#555" }}>
        Signing you in&hellip;
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
