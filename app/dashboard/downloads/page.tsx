"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Download, Monitor, ChevronDown, CheckCircle2,
  AlertTriangle, Terminal, FolderOpen, Info,
  ExternalLink, FileVideo, RotateCcw, Package,
} from "lucide-react";

const PANEL_VERSION = "1.1.0";

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

// ─── Accordion ────────────────────────────────────────────────────────────────

function Accordion({
  title,
  icon: Icon,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ElementType;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
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
        <ChevronDown
          className={`w-4 h-4 text-[#4B5563] transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 bg-[#0D0D0F] border-t border-white/[0.05] space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Download Button ──────────────────────────────────────────────────────────

function DownloadBtn({
  href,
  os,
  size,
}: {
  href: string;
  os: "win" | "mac";
  size: string;
}) {
  const isWin = os === "win";
  return (
    <a
      href={href}
      download
      className="group flex items-center gap-4 rounded-[10px] border border-white/[0.08] bg-[#0F1012] hover:border-white/[0.14] hover:bg-white/[0.03] transition-all p-4"
    >
      {/* OS icon block */}
      <div className="w-10 h-10 rounded-[8px] bg-[#A3FF12]/[0.07] border border-[#A3FF12]/15 flex items-center justify-center flex-shrink-0">
        {isWin ? (
          <Monitor className="w-5 h-5 text-[#A3FF12]" />
        ) : (
          <svg className="w-5 h-5 text-[#A3FF12]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-white">
          {isWin ? "Download for Windows" : "Download for macOS"}
        </p>
        <p className="text-[11px] text-[#4B5563] mt-0.5">
          {isWin ? "prysmor-panel-win.zip" : "prysmor-panel-mac.zip"} · {size}
        </p>
      </div>

      <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] bg-[#A3FF12] text-[#050505] text-[11px] font-bold group-hover:bg-[#B6FF3C] transition-colors">
        <Download className="w-3.5 h-3.5" />
        .zip
      </div>
    </a>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DownloadsPage() {
  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[820px]">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2.5 py-1 rounded-full bg-[#A3FF12]/[0.08] border border-[#A3FF12]/20 text-[10px] font-bold uppercase tracking-widest text-[#A3FF12]">
            Demo Mode
          </span>
        </div>
        <h1 className="text-[28px] sm:text-[34px] font-semibold text-white tracking-tight leading-tight mb-1.5">
          Download Premiere Panel
        </h1>
        <p className="text-[14px] text-[#6B7280] leading-relaxed max-w-[540px]">
          Install the Prysmor CEP extension into Adobe Premiere Pro. This build runs in
          full demo mode — no API key or login required inside the panel.
        </p>
      </div>

      {/* ── MAC INSTALLER ── */}
      <SectionLabel>macOS Installer (.command)</SectionLabel>
      <Card className="p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-[10px] bg-[#A3FF12]/[0.07] border border-[#A3FF12]/15 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-[#A3FF12]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[15px] font-semibold text-white">Prysmor Panel for macOS</p>
              <span className="px-2 py-0.5 rounded-full bg-[#A3FF12]/[0.07] border border-[#A3FF12]/15 text-[10px] font-bold text-[#A3FF12]">
                v{PANEL_VERSION}
              </span>
            </div>
            <p className="text-[12px] text-[#6B7280] mb-4 leading-relaxed">
              Download the ZIP, extract it, then{" "}
              <strong className="text-[#9CA3AF]">double-click</strong>{" "}
              <code className="text-[#A3FF12]/80 bg-white/[0.04] px-1 rounded text-[11px]">Install Prysmor Panel.command</code>
              {" "}— it automatically sets PlayerDebugMode, copies the panel, and clears CEP caches.
            </p>

            <a
              href="/downloads/prysmor-panel-mac.zip"
              download="prysmor-panel-mac.zip"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[9px] bg-[#A3FF12] text-[#050505] text-[13px] font-bold hover:bg-[#B6FF3C] transition-colors"
            >
              <Download className="w-4 h-4" />
              Download for macOS
            </a>

            <p className="mt-3 text-[11px] text-[#4B5563] leading-relaxed">
              After running the installer: restart Premiere Pro → Window → Extensions → Prysmor
            </p>

            <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-1.5">
              {[
                "Unzip → double-click Install Prysmor Panel.command",
                "Sets PlayerDebugMode for CSXS.10, 11 and 12 automatically",
                "Copies panel to ~/Library/Application Support/Adobe/CEP/extensions/",
                "Clears CSXS and Adobe CEP caches automatically",
                "Uninstaller included in the ZIP",
              ].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-[#A3FF12]/70 flex-shrink-0" />
                  <p className="text-[11px] text-[#4B5563]">{s}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-white/[0.05] flex flex-wrap items-center gap-x-5 gap-y-2">
          {["macOS 10.15+", "Premiere Pro 2020–2025", "CEP 10, 11, 12", "No admin rights needed"].map((tag) => (
            <span key={tag} className="flex items-center gap-1.5 text-[11px] text-[#4B5563]">
              <CheckCircle2 className="w-3 h-3 text-[#A3FF12]/60" />
              {tag}
            </span>
          ))}
        </div>
      </Card>

      {/* ── NOTE: First run on macOS ── */}
      <div className="mb-8 rounded-[10px] border border-[#F59E0B]/20 bg-[#F59E0B]/[0.04] px-4 py-3.5">
        <div className="flex gap-2.5">
          <AlertTriangle className="w-4 h-4 text-[#F59E0B] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-semibold text-[#D1D5DB] mb-1">macOS Gatekeeper — first run</p>
            <p className="text-[11px] text-[#6B7280] leading-relaxed">
              macOS may block the <code className="text-[#A3FF12]/80 bg-white/[0.04] px-1 rounded">.command</code> file on first run.{" "}
              <strong className="text-[#9CA3AF]">Right-click → Open</strong> instead of double-clicking, then click{" "}
              <strong className="text-[#9CA3AF]">&quot;Open&quot;</strong> in the dialog.
              You only need to do this once.
            </p>
          </div>
        </div>
      </div>

      {/* ── WINDOWS INSTALLER ── */}
      <SectionLabel>Windows Installer (.exe)</SectionLabel>
      <Card className="p-5 mb-8">
        <div className="flex items-start gap-4">
          {/* Icon */}
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
              One-click installer — copies the CEP panel, sets{" "}
              <code className="text-[#A3FF12]/80 bg-white/[0.04] px-1 rounded text-[11px]">PlayerDebugMode=1</code>{" "}
              for CSXS.11 &amp; CSXS.12, and clears CEP caches automatically.
              No administrator rights required.
            </p>

            <a
              href="/downloads/PrysmorPanelSetup.exe"
              download="PrysmorPanelSetup.exe"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[9px] bg-[#A3FF12] text-[#050505] text-[13px] font-bold hover:bg-[#B6FF3C] transition-colors"
            >
              <Download className="w-4 h-4" />
              Download .exe
            </a>

            <p className="mt-3 text-[11px] text-[#4B5563] leading-relaxed">
              After installing: restart Premiere Pro → Window → Extensions → Prysmor
            </p>

            <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#A3FF12]/70 flex-shrink-0" />
              <p className="text-[11px] text-[#4B5563] leading-relaxed">
                Real installer — built with Inno Setup 6. Source:{" "}
                <code className="text-[#A3FF12]/60 bg-white/[0.03] px-1 rounded">installer/windows/PrysmorPanel.iss</code>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-white/[0.05] flex flex-wrap items-center gap-x-5 gap-y-2">
          {[
            "Windows 10 / 11",
            "Premiere Pro 2022–2025",
            "No admin required",
            "CEP 11 + 12",
          ].map((tag) => (
            <span key={tag} className="flex items-center gap-1.5 text-[11px] text-[#4B5563]">
              <CheckCircle2 className="w-3 h-3 text-[#A3FF12]/60" />
              {tag}
            </span>
          ))}
        </div>
      </Card>

      {/* ── Verify Script ── */}
      <div className="mb-8 rounded-[10px] border border-white/[0.06] bg-[#0F1012] px-4 py-3.5">
        <div className="flex gap-2.5">
          <Terminal className="w-4 h-4 text-[#6B7280] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-semibold text-[#D1D5DB] mb-1">Verify your installation</p>
            <p className="text-[11px] text-[#6B7280] mb-2 leading-relaxed">
              Run this PowerShell script to check the extension folder, registry keys, and asset files:
            </p>
            <pre className="text-[11px] font-mono text-[#A3FF12] bg-[#0B0D0F] border border-white/[0.06] px-3 py-2 rounded-[7px] overflow-x-auto whitespace-nowrap">
              {"powershell -ExecutionPolicy Bypass -File installer\\windows\\verify.ps1"}
            </pre>
          </div>
        </div>
      </div>

      {/* ── A: Download Buttons ── */}
      <SectionLabel>Premiere Pro Panel (Demo)</SectionLabel>
      <Card className="p-5 mb-8">
        <div className="flex items-start gap-3 mb-5 pb-4 border-b border-white/[0.05]">
          <Info className="w-4 h-4 text-[#6B7280] flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#6B7280] leading-relaxed">
            These ZIPs contain the full CEP panel source.{" "}
            <strong className="text-[#9CA3AF]">No build step required</strong> — copy the folder
            directly into the Premiere extensions directory and restart Premiere.
          </p>
        </div>

        <div className="space-y-3">
          <DownloadBtn
            href="/downloads/prysmor-panel-win.zip"
            os="win"
            size="~65 KB"
          />
          <DownloadBtn
            href="/downloads/prysmor-panel-mac.zip"
            os="mac"
            size="~66 KB"
          />
        </div>

        <div className="mt-5 pt-4 border-t border-white/[0.05] flex flex-wrap items-center gap-x-5 gap-y-2">
          {[
            "Adobe Premiere Pro 2020+",
            "Windows 10/11",
            "macOS 10.15+",
            "CEP 10+",
          ].map((tag) => (
            <span key={tag} className="flex items-center gap-1.5 text-[11px] text-[#4B5563]">
              <CheckCircle2 className="w-3 h-3 text-[#A3FF12]/60" />
              {tag}
            </span>
          ))}
        </div>
      </Card>

      {/* ── B: Install Instructions ── */}
      <SectionLabel>Install Instructions</SectionLabel>
      <div className="space-y-2.5 mb-8">

        {/* Windows */}
        <Accordion title="Windows" icon={Monitor} badge="Registry edit required" defaultOpen>
          <div className="space-y-4 pt-2">
            <Step n={1}>
              <strong className="text-[#D1D5DB]">Enable unsigned extension loading</strong>
              <br />
              Open <strong className="text-white">Registry Editor</strong>{" "}
              (<code className="text-[#A3FF12] bg-white/[0.05] px-1 rounded">Win+R → regedit</code>) and navigate to:
              <CodeBlock>HKEY_CURRENT_USER\Software\Adobe\CSXS.10</CodeBlock>
              Add a new <strong className="text-[#D1D5DB]">DWORD</strong> value:
              <CodeBlock>Name:  PlayerDebugMode{"\n"}Value: 1</CodeBlock>
              Or run this in <strong className="text-white">PowerShell</strong> (as your user):
              <CodeBlock>Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.10" -Name "PlayerDebugMode" -Value 1</CodeBlock>
              <span className="text-[11px] text-[#4B5563]">
                If CSXS.10 doesn&apos;t exist, try CSXS.11 (Premiere 2022+).
              </span>
            </Step>

            <Step n={2}>
              <strong className="text-[#D1D5DB]">Extract and copy the extension folder</strong>
              <br />
              Unzip the download, then copy the{" "}
              <code className="text-[#A3FF12] bg-white/[0.05] px-1 rounded">prysmor-panel</code>{" "}
              folder to:
              <CodeBlock>C:\Users\&lt;you&gt;\AppData\Roaming\Adobe\CEP\extensions\prysmor-panel\</CodeBlock>
              The folder name must be <strong className="text-[#D1D5DB]">exactly</strong>{" "}
              <code className="text-[#A3FF12] bg-white/[0.05] px-1 rounded">prysmor-panel</code>.
            </Step>

            <Step n={3}>
              <strong className="text-[#D1D5DB]">Restart Adobe Premiere Pro</strong>
              <br />
              Close and reopen Premiere Pro completely (not just a project).
            </Step>

            <Step n={4}>
              <strong className="text-[#D1D5DB]">Open the panel</strong>
              <br />
              In Premiere Pro:{" "}
              <strong className="text-white">Window → Extensions → Prysmor</strong>
              <br />
              <span className="text-[11px] text-[#4B5563] mt-1 block">
                If &quot;Prysmor&quot; is not listed, check the troubleshooting section below.
              </span>
            </Step>
          </div>
        </Accordion>

        {/* macOS */}
        <Accordion
          title="macOS"
          icon={() => (
            <svg className="w-4 h-4 text-[#6B7280]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
          )}
          badge="Defaults write required"
        >
          <div className="space-y-4 pt-2">
            <Step n={1}>
              <strong className="text-[#D1D5DB]">Enable unsigned extension loading</strong>
              <br />
              Open <strong className="text-white">Terminal</strong> and run:
              <CodeBlock>defaults write com.adobe.CSXS.10 PlayerDebugMode 1</CodeBlock>
              For Premiere 2022+, also try:
              <CodeBlock>defaults write com.adobe.CSXS.11 PlayerDebugMode 1</CodeBlock>
            </Step>

            <Step n={2}>
              <strong className="text-[#D1D5DB]">Extract and copy the extension folder</strong>
              <br />
              Unzip, then move the{" "}
              <code className="text-[#A3FF12] bg-white/[0.05] px-1 rounded">prysmor-panel</code>{" "}
              folder to:
              <CodeBlock>~/Library/Application Support/Adobe/CEP/extensions/prysmor-panel/</CodeBlock>
              Quick Finder shortcut:{" "}
              <code className="text-[#A3FF12] bg-white/[0.05] px-1 rounded">Cmd+Shift+G</code> →
              paste the path above.
            </Step>

            <Step n={3}>
              <strong className="text-[#D1D5DB]">Restart Adobe Premiere Pro</strong>
              <br />
              Quit completely (Cmd+Q) then reopen.
            </Step>

            <Step n={4}>
              <strong className="text-[#D1D5DB]">Open the panel</strong>
              <br />
              <strong className="text-white">Window → Extensions → Prysmor</strong>
            </Step>
          </div>
        </Accordion>

      </div>

      {/* ── C: Replace Demo Clip ── */}
      <SectionLabel>Replace Demo Clip</SectionLabel>
      <Card className="p-5 mb-8">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-[8px] bg-[#F59E0B]/[0.08] border border-[#F59E0B]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FileVideo className="w-4 h-4 text-[#F59E0B]" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-white mb-1.5">
              The bundled demo clip is a placeholder
            </p>
            <p className="text-[12px] text-[#6B7280] leading-relaxed mb-3">
              <strong className="text-[#9CA3AF]">Import to Project</strong> and{" "}
              <strong className="text-[#9CA3AF]">Insert to Timeline</strong> will only work once
              you replace the placeholder file with a real MP4:
            </p>
            <CodeBlock>prysmor-panel/panel/assets/prysmor-demo.mp4</CodeBlock>
            <div className="mt-3 grid sm:grid-cols-3 gap-2">
              {[
                ["Format", "H.264 MP4"],
                ["Resolution", "1920 × 1080"],
                ["Duration", "4 – 8 seconds"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-[7px] bg-[#0D0D0F] border border-white/[0.05] px-3 py-2">
                  <p className="text-[10px] text-[#4B5563] mb-0.5">{k}</p>
                  <p className="text-[12px] font-medium text-[#D1D5DB]">{v}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-[#4B5563]">
              Also replace{" "}
              <code className="text-[#A3FF12]/70 bg-white/[0.04] px-1 rounded">
                panel/assets/prysmor-demo.svg
              </code>{" "}
              with a real thumbnail (.jpg or .png). Update the extension in{" "}
              <code className="text-[#A3FF12]/70 bg-white/[0.04] px-1 rounded">getDemoPaths()</code>{" "}
              inside <code className="text-[#A3FF12]/70 bg-white/[0.04] px-1 rounded">main.js</code>{" "}
              if you change the filename.
            </p>
          </div>
        </div>
      </Card>

      {/* ── D: Troubleshooting ── */}
      <SectionLabel>Troubleshooting</SectionLabel>
      <div className="space-y-2.5 mb-8">

        <Accordion title="Panel not visible in Window → Extensions" icon={AlertTriangle}>
          <div className="space-y-3 pt-2 text-[12px] text-[#9CA3AF] leading-relaxed">
            <div className="flex gap-2">
              <span className="text-[#A3FF12] font-bold flex-shrink-0">→</span>
              <span>
                Confirm <code className="text-[#A3FF12] bg-white/[0.04] px-1 rounded">PlayerDebugMode = 1</code> is set for the{" "}
                <strong className="text-[#D1D5DB]">correct CSXS version</strong>. Premiere 2020–2021 uses CSXS.10;
                Premiere 2022+ uses CSXS.11. Try setting both.
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-[#A3FF12] font-bold flex-shrink-0">→</span>
              <span>
                The folder inside the extensions directory must be named exactly{" "}
                <code className="text-[#A3FF12] bg-white/[0.04] px-1 rounded">prysmor-panel</code>{" "}
                (matches the <code className="text-[#A3FF12] bg-white/[0.04] px-1 rounded">ExtensionBundleId</code> in{" "}
                <code className="text-[#A3FF12] bg-white/[0.04] px-1 rounded">manifest.xml</code>).
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-[#A3FF12] font-bold flex-shrink-0">→</span>
              <span>
                Fully <strong className="text-[#D1D5DB]">quit and relaunch</strong> Premiere Pro after copying
                the folder.
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-[#A3FF12] font-bold flex-shrink-0">→</span>
              <span>
                Check that <code className="text-[#A3FF12] bg-white/[0.04] px-1 rounded">CSXS/manifest.xml</code> is
                present inside the extension folder.
              </span>
            </div>
          </div>
        </Accordion>

        <Accordion title="Import to Project / Insert to Timeline fails" icon={AlertTriangle}>
          <div className="space-y-3 pt-2 text-[12px] text-[#9CA3AF] leading-relaxed">
            <div className="flex gap-2">
              <span className="text-[#A3FF12] font-bold flex-shrink-0">→</span>
              <span>
                <strong className="text-[#D1D5DB]">Replace the placeholder</strong>{" "}
                <code className="text-[#A3FF12] bg-white/[0.04] px-1 rounded">panel/assets/prysmor-demo.mp4</code>{" "}
                with a real H.264 MP4 — the current file is a text file and cannot be imported.
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-[#A3FF12] font-bold flex-shrink-0">→</span>
              <span>
                For <strong className="text-[#D1D5DB]">Insert to Timeline</strong> to work, a sequence must be open in the
                Premiere Timeline panel before clicking the button.
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-[#A3FF12] font-bold flex-shrink-0">→</span>
              <span>
                The panel reports the exact error in a red toast. The ExtendScript function{" "}
                <code className="text-[#A3FF12] bg-white/[0.04] px-1 rounded">insertToTimeline()</code>{" "}
                in <code className="text-[#A3FF12] bg-white/[0.04] px-1 rounded">host.jsx</code> searches all bins
                recursively.
              </span>
            </div>
          </div>
        </Accordion>

        <Accordion title="Download / Show File does nothing" icon={AlertTriangle}>
          <div className="space-y-3 pt-2 text-[12px] text-[#9CA3AF] leading-relaxed">
            <div className="flex gap-2">
              <span className="text-[#A3FF12] font-bold flex-shrink-0">→</span>
              <span>
                The Download button attempts a <code className="text-[#A3FF12] bg-white/[0.04] px-1 rounded">cep.fs</code> save
                dialog first. If that&apos;s unavailable, it opens the file URL in your OS default application.
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-[#A3FF12] font-bold flex-shrink-0">→</span>
              <span>
                If neither works, the toast shows the full local file path — navigate to that folder manually
                in Explorer/Finder.
              </span>
            </div>
          </div>
        </Accordion>

        <Accordion title="CEP version compatibility" icon={Info}>
          <div className="space-y-3 pt-2 text-[12px] text-[#9CA3AF] leading-relaxed">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="text-[11px] font-semibold text-[#6B7280] pb-2 pr-6">Premiere Pro Version</th>
                    <th className="text-[11px] font-semibold text-[#6B7280] pb-2 pr-6">CEP Version</th>
                    <th className="text-[11px] font-semibold text-[#6B7280] pb-2">Registry/Defaults Key</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {[
                    ["2020 (v14)", "CEP 10", "CSXS.10"],
                    ["2021 (v15)", "CEP 10", "CSXS.10"],
                    ["2022 (v22)", "CEP 11", "CSXS.11"],
                    ["2023 (v23)", "CEP 11", "CSXS.11"],
                    ["2024 (v24)", "CEP 11", "CSXS.11"],
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
            <p className="text-[11px] text-[#4B5563]">
              The manifest targets{" "}
              <code className="text-[#A3FF12]/70 bg-white/[0.04] px-1 rounded">&lt;RequiredRuntime Name=&quot;CSXS&quot; Version=&quot;10.0&quot;/&gt;</code>.
              Update to 11.0 in manifest.xml if targeting 2022+ only.
            </p>
          </div>
        </Accordion>

      </div>

      {/* ── Footer links ── */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/docs"
          className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#D1D5DB] transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Full documentation
        </Link>
        <Link
          href="/docs/install-panel"
          className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#D1D5DB] transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Public install guide
        </Link>
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#D1D5DB] transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Back to Overview
        </Link>
      </div>

    </div>
  );
}
