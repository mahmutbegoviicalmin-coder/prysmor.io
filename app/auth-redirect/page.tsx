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
        gap: "20px",
      }}
    >
      {/* Logo, gives visual context so it doesn't look like a black screen */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/vecilogo.png" alt="Prysmor" width={26} height={26} style={{ objectFit: "contain" }} />
        <span style={{ fontSize: "17px", fontWeight: 700, color: "white", letterSpacing: "-0.5px" }}>
          Prysmor
        </span>
      </div>
      <div
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          border: "2px solid #1a1a1a",
          borderTopColor: "#39FF6A",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <p style={{ margin: 0, fontSize: "13px", color: "#4B5563" }}>
        Signing you in&hellip;
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
