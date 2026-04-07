import { currentUser } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock, Zap, ArrowRight } from "lucide-react";
import { getUser, PLAN_LABELS, PLAN_CREDITS } from "@/lib/firestore/users";
import DownloadsContent from "./DownloadsContent";

export const metadata = { title: "Download Plugin — Dashboard" };

// ─── Paywall shown to users without an active subscription ───────────────────

function PaywallGate({ planName }: { planName: string }) {
  const plans = [
    { key: "starter",   label: "Starter",   price: "$29/mo",  credits: 1000, seconds: "250s" },
    { key: "pro",       label: "Pro",        price: "$49/mo",  credits: 2000, seconds: "500s" },
    { key: "exclusive", label: "Exclusive",  price: "$149/mo", credits: 4000, seconds: "1000s" },
  ];

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[700px]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] sm:text-[32px] font-semibold text-white tracking-tight mb-2">
          Download Plugin
        </h1>
        <p className="text-[14px] text-[#6B7280]">
          Get the Prysmor CEP extension for Adobe Premiere Pro.
        </p>
      </div>

      {/* Lock card */}
      <div className="rounded-[16px] border border-white/[0.08] bg-[#111113] p-8 mb-8 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-5">
          <Lock className="w-6 h-6 text-[#4B5563]" />
        </div>
        <h2 className="text-[18px] font-semibold text-white mb-2">
          Active plan required
        </h2>
        <p className="text-[13px] text-[#6B7280] max-w-[380px] leading-relaxed mb-6">
          The Prysmor panel download is available to subscribers. Choose a plan below
          to get instant access to the plugin, AI VFX generation, and Identity Lock.
        </p>
        <Link
          href="/#pricing"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[9px] bg-[#A3FF12] text-[#050505] text-[13px] font-bold hover:bg-[#B6FF3C] transition-colors"
        >
          <Zap className="w-4 h-4" />
          View plans
        </Link>
      </div>

      {/* Plan cards */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">
        Choose a plan
      </p>
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        {plans.map((p) => (
          <Link
            key={p.key}
            href={`/checkout?plan=${p.key}&billing=monthly`}
            className="group flex flex-col gap-2 p-4 rounded-[12px] border border-white/[0.07] bg-[#0E0E13] hover:border-[#A3FF12]/30 hover:bg-[#A3FF12]/[0.03] transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-white">{p.label}</span>
              <span className="text-[12px] font-bold text-[#A3FF12]">{p.price}</span>
            </div>
            <div className="text-[11px] text-[#4B5563] space-y-0.5">
              <p>{p.credits.toLocaleString()} credits / mo</p>
              <p>≈ {p.seconds} of AI VFX</p>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-[#A3FF12] group-hover:gap-2 transition-all">
              Subscribe <ArrowRight className="w-3 h-3" />
            </div>
          </Link>
        ))}
      </div>

      <p className="text-[11px] text-[#374151] text-center">
        Already subscribed?{" "}
        <Link href="/dashboard/billing" className="text-[#6B7280] hover:text-white transition-colors underline underline-offset-2">
          Check your billing status
        </Link>
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DownloadsPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const userDoc       = await getUser(user.id).catch(() => null);
  const licenseStatus = userDoc?.licenseStatus ?? "inactive";
  const plan          = userDoc?.plan ?? "starter";
  const planName      = PLAN_LABELS[plan] ?? "Starter";

  if (licenseStatus !== "active") {
    return <PaywallGate planName={planName} />;
  }

  return <DownloadsContent />;
}
