import { BookOpen, PanelLeft, Zap, Sparkles, ChevronRight } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Docs — Dashboard" };

const sections = [
  {
    icon: PanelLeft,
    title: "Panel Installation",
    desc: "Install and activate the Premiere Pro extension.",
    href: "/docs",
  },
  {
    icon: Zap,
    title: "CutSync Guide",
    desc: "Silence removal, beat sync, jump cuts, auto pacing.",
    href: "/cutsync",
  },
  {
    icon: Sparkles,
    title: "MotionForge Guide",
    desc: "Text-to-VFX generation, effect packs, alpha exports.",
    href: "/motionforge",
  },
];

export default function DashboardDocsPage() {
  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[800px]">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-1.5">Documentation</h1>
        <p className="text-[14px] text-[#6B7280]">Guides and references for Prysmor products.</p>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Guides</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] overflow-hidden mb-8">
        {sections.map((s, i) => {
          const Icon = s.icon;
          return (
            <Link key={s.title} href={s.href}
              className={`flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors group ${i < sections.length - 1 ? "border-b border-white/[0.04]" : ""}`}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-[8px] bg-[#A3FF12]/[0.07] border border-[#A3FF12]/[0.14] flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-[#A3FF12]" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[#D1D5DB]">{s.title}</p>
                  <p className="text-[11px] text-[#4B5563] mt-0.5">{s.desc}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#374151] group-hover:text-[#6B7280] transition-colors flex-shrink-0" />
            </Link>
          );
        })}
      </div>

      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-3.5 h-3.5 text-[#4B5563]" />
          <p className="text-[13px] font-medium text-[#9CA3AF]">Support</p>
        </div>
        <p className="text-[13px] text-[#6B7280] leading-relaxed">
          For technical issues or account questions, contact{" "}
          <a href="mailto:support@prysmor.io" className="text-[#A3FF12] hover:underline underline-offset-2">
            support@prysmor.io
          </a>
          . Response time is typically within 24 hours.
        </p>
      </div>
    </div>
  );
}
