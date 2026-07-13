import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock, Zap, ArrowRight } from "lucide-react";
import { getUser } from "@/lib/firestore/users";
import DownloadsContent from "./DownloadsContent";

export const metadata = { title: "Download Plugin | Dashboard" };

// ─── Paywall shown to users without an active license ────────────────────────

function PaywallGate() {
  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[700px]">
      <div className="mb-8">
        <h1 className="text-[28px] sm:text-[32px] font-semibold text-white tracking-tight mb-2">
          Download Plugin
        </h1>
        <p className="text-[14px] text-[#6B7280]">
          Get the Prysmor CEP extension for Adobe Premiere Pro and After Effects.
        </p>
      </div>

      <div className="rounded-[16px] border border-white/[0.08] bg-[#111113] p-8 mb-8 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-5">
          <Lock className="w-6 h-6 text-[#4B5563]" />
        </div>
        <h2 className="text-[18px] font-semibold text-white mb-2">
          License required
        </h2>
        <p className="text-[13px] text-[#6B7280] max-w-[380px] leading-relaxed mb-6">
          The Prysmor panel download is available with a lifetime license. Buy once
          to get instant access to the plugin and 200 seconds of AI VFX.
        </p>
        <Link
          href="/checkout"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[9px] bg-[#A3FF12] text-[#050505] text-[13px] font-bold hover:bg-[#B6FF3C] transition-colors"
        >
          <Zap className="w-4 h-4" />
          Buy Prysmor — $99
        </Link>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">
        Lifetime license
      </p>
      <Link
        href="/checkout"
        className="group flex flex-col gap-2 p-5 rounded-[12px] border border-white/[0.07] bg-[#0E0E13] hover:border-[#A3FF12]/30 hover:bg-[#A3FF12]/[0.03] transition-all mb-6"
      >
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold text-white">Prysmor</span>
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] text-[#4B5563] line-through">$199</span>
            <span className="text-[14px] font-bold text-[#A3FF12]">$99</span>
          </div>
        </div>
        <div className="text-[11px] text-[#4B5563] space-y-0.5">
          <p>200 seconds of AI VFX included · Never expires</p>
          <p>Premiere + After Effects · pay once</p>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-[#A3FF12] group-hover:gap-2 transition-all">
          Buy Prysmor <ArrowRight className="w-3 h-3" />
        </div>
      </Link>

      <p className="text-[11px] text-[#374151] text-center">
        Already purchased?{" "}
        <Link href="/dashboard/billing" className="text-[#6B7280] hover:text-white transition-colors underline underline-offset-2">
          Check your billing status
        </Link>
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DownloadsPage() {
  const session = await getSessionUser();
  if (!session) redirect("/sign-in");

  const userDoc       = await getUser(session.userId).catch(() => null);
  const licenseStatus = userDoc?.licenseStatus ?? "inactive";

  if (licenseStatus !== "active") {
    return <PaywallGate />;
  }

  return <DownloadsContent />;
}
