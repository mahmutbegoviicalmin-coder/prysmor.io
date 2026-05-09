"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** Reads ?ref=CODE from URL and stores it in a 30-day cookie */
export default function RefTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref && ref.length > 0 && ref.length <= 20) {
      // Store in cookie for 30 days
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      document.cookie = `prysmor_ref=${encodeURIComponent(ref.toUpperCase())}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
    }
  }, [searchParams]);

  return null;
}

/** Read the affiliate referral code from cookie */
export function getRefCodeFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)prysmor_ref=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
