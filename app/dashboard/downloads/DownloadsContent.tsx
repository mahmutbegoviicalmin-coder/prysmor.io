"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Download, Monitor, ChevronDown, CheckCircle2,
  AlertTriangle, Terminal, Info,
  ExternalLink, RotateCcw, Package, Zap, Cpu,
} from "lucide-react";

const PANEL_VERSION = "2.6.4";

/** Permanent download URLs — GitHub Releases (not committed to `public/`) */
const DOWNLOAD_WIN =
  "https://github.com/mahmutbegoviicalmin-coder/prysmor.io/releases/download/v2.6.4/PrysmrSetup.exe";
const DOWNLOAD_MAC =
  "https://github.com/mahmutbegoviicalmin-coder/prysmor.io/releases/download/v2.6.4/Prysmor-2.6.4.pkg";

// ─── Primitives ───────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">
      {children}
    </p>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[12px] border border-white/[0.07] bg-[#111113] ${className}`}>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-2 rounded-[8px] bg-[#0D0D0F] border border-white/[0.05] px-4 py-3 text-[12px] font-mono text-[#A3FF12] overflow-x-auto whitespace-pre-wrap break-all">
      {children}
    </pre>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#A3FF12]/10 border border-[#A3FF12]/20 flex items-center justify-center mt-0.5">
        <span className="text-[11px] font-bold text-[#A3FF12]">{n}</span>
      </div>
      <div className="flex-1 text-[13px] text-[#9CA3AF] leading-relaxed">{children}</div>
    </div>
  );
}

function FeatureRow({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 className="w-3 h-3 text-[#A3FF12]/70 flex-shrink-0" />
      <p className="text-[11px] text-[#4B5563]">{children}</p>
    </div>
  );
}

// ─── Accordion ────────────────────────────────────────────────────────────────

function Accordion({
  title, icon: Icon, badge, children, defaultOpen = false,
}: {
  title: string; icon: React.ElementType; badge?: string;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/[0.07] rounded-[10px] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-[#111113] hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-[#6B7280] flex-shrink-0" />
          <span className="text-[13px] font-medium text-[#D1D5DB]">{title}</span>
          {badge && (
            <span className="px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.07] text-[10px] text-[#6B7280]">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-[#4B5563] transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 bg-[#0D0D0F] border-t border-white/[0.05] space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── MacOS Icon ───────────────────────────────────────────────────────────────

function MacIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DownloadsContent() {
  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[820px]">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#A3FF12]/[0.08] border border-[#A3FF12]/20 text-[10px] font-bold uppercase tracking-widest text-[#A3FF12]">
            <Zap className="w-3 h-3" />
            v{PANEL_VERSION}
          </span>
        </div>
        <h1 className="text-[28px] sm:text-[34px] font-semibold text-white tracking-tight leading-tight mb-1.5">
          Download Premiere Panel
        </h1>
        <p className="text-[14px] text-[#6B7280] leading-relaxed max-w-[560px]">
          Install the Prysmor CEP extension into Adobe Premiere Pro.
          AI-powered VFX with Claude vision for intelligent prompt enhancement and automatic video optimisation — no configuration needed.
        </p>
      </div>

      {/* ── WINDOWS INSTALLER ── */}
      <SectionLabel>Windows Installer (.exe)</SectionLabel>
      <Card className="p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-[10px] bg-[#A3FF12]/[0.07] border border-[#A3FF12]/15 flex items-center justify-center flex-shrink-0">
            <Package className="w-6 h-6 text-[#A3FF12]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[15px] font-semibold text-white">Prysmor Panel for Windows</p>
              <span className="px-2 py-0.5 rounded-full bg-[#A3FF12]/[0.07] border border-[#A3FF12]/15 text-[10px] font-bold text-[#A3FF12]">
                v{PANEL_VERSION}
              </span>
            </div>
            <p className="text-[12px] text-[#6B7280] mb-4 leading-relaxed">
              One-click installer — sets up the CEP panel with bundled ffmpeg for automatic
              video preprocessing. No Python, no sidecar, no configuration needed.
            </p>

            <a
              href={DOWNLOAD_WIN}
              download="PrysmrSetup.exe"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[9px] bg-[#A3FF12] text-[#050505] text-[13px] font-bold hover:bg-[#B6FF3C] transition-colors"
            >
              <Download className="w-4 h-4" />
              Download for Windows
            </a>

            <p className="mt-3 text-[11px] text-[#4B5563] leading-relaxed">
              After installing: restart Premiere Pro → Window → Extensions → Prysmor
            </p>

            <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-1.5">
              {[
                "CEP panel installed automatically to correct Premiere Pro folder",
                "ffmpeg bundled — auto-crops and scales wide videos before AI processing",
                "Claude AI vision for intelligent scene analysis and prompt enhancement",
                "PlayerDebugMode set for CSXS.10, 11, 12, 13 automatically",
                "CEP caches cleared — panel loads immediately on next Premiere launch",
                "One-click setup — no configuration, no admin rights needed",
              ].map((s) => <FeatureRow key={s}>{s}</FeatureRow>)}
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-white/[0.05] flex flex-wrap items-center gap-x-5 gap-y-2">
          {["Windows 10 / 11", "Premiere Pro 2022–2025", "CEP 11, 12, 13", "No admin rights needed"].map((tag) => (
            <span key={tag} className="flex items-center gap-1.5 text-[11px] text-[#4B5563]">
              <CheckCircle2 className="w-3 h-3 text-[#A3FF12]/60" />
              {tag}
            </span>
          ))}
        </div>
      </Card>

      {/* ── MAC INSTALLER ── */}
      <SectionLabel>macOS Installer</SectionLabel>
      <Card className="p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-[10px] bg-[#A3FF12]/[0.07] border border-[#A3FF12]/15 flex items-center justify-center flex-shrink-0">
            <MacIcon className="w-6 h-6 text-[#A3FF12]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[15px] font-semibold text-white">Prysmor Panel for macOS</p>
              <span className="px-2 py-0.5 rounded-full bg-[#A3FF12]/[0.07] border border-[#A3FF12]/15 text-[10px] font-bold text-[#A3FF12]">
                v{PANEL_VERSION}
              </span>
            </div>
            <p className="text-[12px] text-[#6B7280] mb-4 leading-relaxed">
              One-click installer — download the <code className="text-[#A3FF12]/80 bg-white/[0.04] px-1 rounded text-[11px]">.pkg</code>, open it,
              and follow the wizard. Sets up the CEP panel with bundled ffmpeg. No configuration needed.
            </p>

            <a
              href={DOWNLOAD_MAC}
              download="Prysmor-2.6.4.pkg"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[9px] bg-[#A3FF12] text-[#050505] text-[13px] font-bold hover:bg-[#B6FF3C] transition-colors"
            >
              <Download className="w-4 h-4" />
              Download for macOS
            </a>

            <p className="mt-3 text-[11px] text-[#4B5563] leading-relaxed">
              After installing: restart Premiere Pro → Window → Extensions → Prysmor
            </p>

            <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-1.5">
              {[
                "CEP panel installed to ~/Library/Application Support/Adobe/CEP/extensions",
                "ffmpeg bundled for automatic video preprocessing",
                "No admin rights needed",
                "macOS 12+ supported",
                "Premiere Pro 2022–2025",
              ].map((s) => <FeatureRow key={s}>{s}</FeatureRow>)}
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-white/[0.05] flex flex-wrap items-center gap-x-5 gap-y-2">
          {["macOS 12+", "Premiere Pro 2022–2025", "CEP 11, 12, 13", "No admin rights needed"].map((tag) => (
            <span key={tag} className="flex items-center gap-1.5 text-[11px] text-[#4B5563]">
              <CheckCircle2 className="w-3 h-3 text-[#A3FF12]/60" />
              {tag}
            </span>
          ))}
        </div>
      </Card>

      {/* ── macOS Gatekeeper note ── */}
      <div className="mb-8 rounded-[10px] border border-[#F59E0B]/20 bg-[#F59E0B]/[0.04] px-4 py-3.5">
        <div className="flex gap-2.5">
          <AlertTriangle className="w-4 h-4 text-[#F59E0B] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-semibold text-[#D1D5DB] mb-1">macOS — first run</p>
            <p className="text-[11px] text-[#6B7280] leading-relaxed">
              If Gatekeeper blocks the installer: <strong className="text-[#9CA3AF]">right-click the .pkg → Open</strong>, then confirm.
              Or <strong className="text-[#9CA3AF]">System Settings → Privacy &amp; Security → Open Anyway</strong>.
              You only need to do this once.
            </p>
          </div>
        </div>
      </div>

      {/* ── What's included ── */}
      <SectionLabel>What&apos;s included</SectionLabel>
      <Card className="p-5 mb-8">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-[8px] bg-[#A3FF12]/[0.08] border border-[#A3FF12]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Cpu className="w-4 h-4 text-[#A3FF12]" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-white mb-1.5">
              AI-powered VFX directly in Adobe Premiere Pro
            </p>
            <p className="text-[12px] text-[#6B7280] leading-relaxed mb-3">
              The panel connects to Claude AI for intelligent prompt enhancement and Runway Gen-4 for
              video-to-video AI generation — all from inside Premiere Pro. No extra software running
              in the background, no startup services.
            </p>
            <div className="grid sm:grid-cols-3 gap-2">
              {[
                ["Claude Vision", "Scene analysis & prompt enhancement"],
                ["Auto Preprocessing", "ffmpeg crops wide video to 720p"],
                ["Runway Gen-4", "Video-to-video AI generation"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-[7px] bg-[#0D0D0F] border border-white/[0.05] px-3 py-2">
                  <p className="text-[10px] text-[#4B5563] mb-0.5">{k}</p>
                  <p className="text-[12px] font-medium text-[#D1D5DB]">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Troubleshooting ── */}
      <SectionLabel>Troubleshooting</SectionLabel>
      <div className="space-y-2.5 mb-8">

        <Accordion title="Panel not visible in Window → Extensions" icon={AlertTriangle}>
          <div className="space-y-3 pt-2 text-[12px] text-[#9CA3AF] leading-relaxed">
            {[
              <>Confirm <code className="text-[#A3FF12] bg-white/[0.04] px-1 rounded">PlayerDebugMode = 1</code> is set for the correct CSXS version. Premiere 2022+ uses CSXS.11. The installer sets all versions automatically.</>,
              <>The extension folder must be named exactly <code className="text-[#A3FF12] bg-white/[0.04] px-1 rounded">com.prysmor.panel</code> inside the CEP extensions directory. Remove any older <code className="text-[#A3FF12] bg-white/[0.04] px-1 rounded">prysmor-panel</code> folder if present — two folders with the same bundle ID cause conflicts.</>,
              <>Fully <strong className="text-[#D1D5DB]">quit and relaunch</strong> Premiere Pro after installation.</>,
              <>Check that <code className="text-[#A3FF12] bg-white/[0.04] px-1 rounded">CSXS/manifest.xml</code> is present inside the extension folder.</>,
            ].map((s, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-[#A3FF12] font-bold flex-shrink-0">→</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </Accordion>

        <Accordion title="Video too wide — generation blocked" icon={AlertTriangle}>
          <div className="space-y-3 pt-2 text-[12px] text-[#9CA3AF] leading-relaxed">
            {[
              <>Runway Gen-4 requires a video width/height ratio of at most <strong className="text-[#D1D5DB]">2.358:1</strong>. The panel automatically detects and crops wide videos using bundled ffmpeg.</>,
              <>If ffmpeg is not found (macOS without system ffmpeg), the panel will show an error. Install ffmpeg via Homebrew: <code className="text-[#A3FF12] bg-white/[0.04] px-1 rounded">brew install ffmpeg</code></>,
              <>If the source clip is still blocked, export your Premiere sequence as a 1920×1080 H.264 file and generate from that file instead.</>,
            ].map((s, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-[#A3FF12] font-bold flex-shrink-0">→</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </Accordion>

        <Accordion title="CEP version compatibility" icon={Info}>
          <div className="space-y-3 pt-2 text-[12px] text-[#9CA3AF] leading-relaxed">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="text-[11px] font-semibold text-[#6B7280] pb-2 pr-6">Premiere Pro</th>
                    <th className="text-[11px] font-semibold text-[#6B7280] pb-2 pr-6">CEP</th>
                    <th className="text-[11px] font-semibold text-[#6B7280] pb-2">Key</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {[
                    ["2020–2021 (v14–15)", "CEP 10", "CSXS.10"],
                    ["2022–2024 (v22–24)", "CEP 11", "CSXS.11"],
                    ["2025 (v25)", "CEP 12", "CSXS.12"],
                    ["2025+ (v25.x)", "CEP 13", "CSXS.13"],
                  ].map(([v, cep, key]) => (
                    <tr key={v}>
                      <td className="py-2 pr-6 text-[#D1D5DB]">{v}</td>
                      <td className="py-2 pr-6">{cep}</td>
                      <td className="py-2 font-mono text-[#A3FF12]/80">{key}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Accordion>

        <Accordion title="Windows: verify installation" icon={Terminal}>
          <div className="space-y-3 pt-2">
            <p className="text-[12px] text-[#9CA3AF]">
              Run this PowerShell script to verify the extension folder and registry keys:
            </p>
            <CodeBlock>{"powershell -ExecutionPolicy Bypass -File installer\\windows\\verify.ps1"}</CodeBlock>
          </div>
        </Accordion>

      </div>

      {/* Footer links */}
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard/docs" className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#D1D5DB] transition-colors">
          <ExternalLink className="w-3.5 h-3.5" />
          Full documentation
        </Link>
        <Link href="/docs/install-panel" className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#D1D5DB] transition-colors">
          <ExternalLink className="w-3.5 h-3.5" />
          Public install guide
        </Link>
        <Link href="/dashboard" className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#D1D5DB] transition-colors">
          <RotateCcw className="w-3.5 h-3.5" />
          Back to Overview
        </Link>
      </div>

    </div>
  );
}
