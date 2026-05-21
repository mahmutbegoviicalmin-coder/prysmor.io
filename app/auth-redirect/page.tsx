'use client';

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function AuthRedirectPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    if (user) {
      router.replace("/dashboard");
    } else {
      router.replace("/sign-in");
    }
  }, [user, isLoaded, router]);

  // Blank while Clerk loads — no flash
  return null;
}
