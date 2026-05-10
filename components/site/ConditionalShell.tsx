"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";
import Navbar from "@/components/site/Navbar";
import Footer from "@/components/site/Footer";
import RefTracker from "@/components/site/RefTracker";
import AnnouncementBar from "@/components/site/AnnouncementBar";

export default function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname.startsWith("/dashboard");
  const isLanding = pathname === "/";

  return (
    <>
      <Suspense fallback={null}>
        <RefTracker />
      </Suspense>
      {isLanding && <AnnouncementBar />}
      {!isDashboard && <Navbar />}
      <main>{children}</main>
      {!isDashboard && <Footer />}
    </>
  );
}
