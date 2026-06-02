"use client";

import Link from "next/link";
import { Monitor } from "lucide-react";

const PANEL_VERSION = "5.4.3";
const PANEL_AE_VERSION = "1.0.0";

const DOWNLOADS = {
  premiere: {
    label: "Premiere Pro",
    version: PANEL_VERSION,
    accent: "#39FF6A",
    win: "https://github.com/mahmutbegoviicalmin-coder/prysmor.io/releases/download/v5.4.3/PrysmrSetup.exe",
    mac: "https://github.com/mahmutbegoviicalmin-coder/prysmor.io/releases/download/v5.4.3/Prysmor-5.4.3.pkg",
    winFile: "PrysmrSetup.exe",
    macFile: "Prysmor-5.4.3.pkg",
  },
  ae: {
    label: "After Effects",
    version: PANEL_AE_VERSION,
    accent: "#818CF8",
    win: "https://github.com/mahmutbegoviicalmin-coder/prysmor.io/releases/download/panel-ae-v1.0.0/PrysmorAE-Setup.exe",
    mac: "https://github.com/mahmutbegoviicalmin-coder/prysmor.io/releases/download/panel-ae-v1.0.0/PrysmorAE-1.0.0.pkg",
    winFile: "PrysmorAE-Setup.exe",
    macFile: "PrysmorAE-1.0.0.pkg",
  },
} as const;

function MacIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function PluginCard({
  label,
  version,
  accent,
  win,
  mac,
  winFile,
  macFile,
}: {
  label: string;
  version: string;
  accent: string;
  win: string;
  mac: string;
  winFile: string;
  macFile: string;
}) {
  return (
    <div className="rounded-[14px] border border-white/[0.07] bg-[#0c0c0c] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h2 className="text-[16px] font-semibold text-white">{label}</h2>
        <span
          className="text-[11px] font-medium px-2 py-0.5 rounded-full border"
          style={{ color: accent, borderColor: `${accent}33`, backgroundColor: `${accent}12` }}
        >
          v{version}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <a
          href={win}
          download={winFile}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-[10px] bg-white text-[#050505] text-[13px] font-semibold hover:bg-[#f0f0f0] transition-colors"
        >
          <Monitor className="w-4 h-4" />
          Windows
        </a>
        <a
          href={mac}
          download={macFile}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-[10px] bg-white/[0.06] border border-white/[0.08] text-white text-[13px] font-semibold hover:bg-white/[0.10] transition-colors"
        >
          <MacIcon className="w-4 h-4" />
          macOS
        </a>
      </div>
    </div>
  );
}

export default function DownloadsContent() {
  const premiere = DOWNLOADS.premiere;
  const ae = DOWNLOADS.ae;

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[520px]">
      <div className="mb-8">
        <h1 className="text-[26px] font-semibold text-white tracking-tight mb-1.5">
          Download Plugin
        </h1>
        <p className="text-[14px] text-[#6B7280]">
          Install, restart Adobe, then open{" "}
          <span className="text-[#9CA3AF]">Window → Extensions → Prysmor</span>.
        </p>
      </div>

      <div className="space-y-3 mb-6">
        <PluginCard {...premiere} />
        <PluginCard {...ae} />
      </div>

      <p className="text-[12px] text-[#4B5563] leading-relaxed">
        macOS blocked? Right-click the installer → Open.
      </p>

      <Link
        href="/docs/install-panel"
        className="inline-block mt-5 text-[12px] text-[#6B7280] hover:text-[#D1D5DB] transition-colors"
      >
        Install guide →
      </Link>
    </div>
  );
}
