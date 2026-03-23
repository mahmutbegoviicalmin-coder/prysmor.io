import Link from "next/link";
import { Download, Monitor, Terminal, FolderOpen, CheckCircle2, AlertTriangle, ChevronRight } from "lucide-react";

export const metadata = {
  title: "Install Premiere Panel — Prysmor Docs",
  description:
    "Step-by-step guide to installing the Prysmor CEP extension panel inside Adobe Premiere Pro on Windows and macOS.",
};

// ─── Primitives ───────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[22px] font-semibold text-white tracking-tight mb-1.5">
      {children}
    </h2>
  );
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] text-[#6B7280] leading-relaxed mb-6">{children}</p>;
}

function CodeLine({ children }: { children: React.ReactNode }) {
  return (
    <code className="inline-block font-mono text-[12px] text-[#A3FF12] bg-white/[0.05] border border-white/[0.06] px-2 py-0.5 rounded-[5px]">
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="rounded-[10px] bg-[#0B0D0F] border border-white/[0.07] px-5 py-4 text-[12px] font-mono text-[#A3FF12] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
      {children}
    </pre>
  );
}

function StepCard({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-[#A3FF12]/[0.08] border border-[#A3FF12]/25 flex items-center justify-center flex-shrink-0">
          <span className="text-[13px] font-bold text-[#A3FF12]">{n}</span>
        </div>
        <div className="flex-1 w-px bg-white/[0.06] mt-2" />
      </div>
      <div className="pb-8 flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-white mb-2">{title}</p>
        <div className="text-[13px] text-[#9CA3AF] leading-relaxed space-y-2">{children}</div>
      </div>
    </div>
  );
}

function ScreenshotPlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded-[10px] border border-white/[0.07] bg-[#0F1012] flex flex-col items-center justify-center py-10 px-6 text-center">
      <div className="w-12 h-12 rounded-[10px] bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-3">
        <Monitor className="w-6 h-6 text-[#374151]" />
      </div>
      <p className="text-[12px] font-medium text-[#4B5563] mb-0.5">Screenshot</p>
      <p className="text-[11px] text-[#374151]">{label}</p>
    </div>
  );
}

function InfoBox({ type, children }: { type: "tip" | "warn"; children: React.ReactNode }) {
  const isWarn = type === "warn";
  return (
    <div
      className={`flex gap-3 rounded-[10px] border px-4 py-3.5 ${
        isWarn
          ? "border-[#F59E0B]/20 bg-[#F59E0B]/[0.05]"
          : "border-[#A3FF12]/15 bg-[#A3FF12]/[0.04]"
      }`}
    >
      {isWarn ? (
        <AlertTriangle className="w-4 h-4 text-[#F59E0B] flex-shrink-0 mt-0.5" />
      ) : (
        <CheckCircle2 className="w-4 h-4 text-[#A3FF12] flex-shrink-0 mt-0.5" />
      )}
      <div className="text-[12px] leading-relaxed text-[#9CA3AF]">{children}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InstallPanelPage() {
  return (
    <main className="min-h-screen" style={{ background: "#070708" }}>

      {/* ── Hero ── */}
      <div
        className="border-b border-white/[0.06]"
        style={{ background: "linear-gradient(180deg, #0C0F0A 0%, #070708 100%)" }}
      >
        <div className="max-w-[820px] mx-auto px-6 py-16">
          <div className="flex items-center gap-2 mb-5">
            <Link href="/docs" className="text-[12px] text-[#4B5563] hover:text-[#9CA3AF] transition-colors">
              Docs
            </Link>
            <span className="text-[#1F2937]">/</span>
            <span className="text-[12px] text-[#6B7280]">Install Premiere Panel</span>
          </div>

          <div className="flex items-center gap-2.5 mb-5">
            <span className="px-2.5 py-1 rounded-full bg-[#A3FF12]/[0.08] border border-[#A3FF12]/20 text-[10px] font-bold uppercase tracking-widest text-[#A3FF12]">
              CEP Extension
            </span>
            <span className="px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.07] text-[10px] font-medium text-[#4B5563]">
              Premiere Pro 2020+
            </span>
            <span className="px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.07] text-[10px] font-medium text-[#4B5563]">
              Demo Mode
            </span>
          </div>

          <h1 className="text-[38px] sm:text-[48px] font-semibold text-white tracking-tight leading-[1.1] mb-4">
            Install the Premiere<br />
            <span className="text-[#A3FF12]">Panel</span>
          </h1>
          <p className="text-[16px] text-[#6B7280] leading-relaxed max-w-[520px] mb-8">
            Get the Prysmor AI VFX extension running inside Adobe Premiere Pro in under
            5 minutes — no build step, no signing required for local testing.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/downloads"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#A3FF12] text-[#050505] text-[13px] font-bold hover:bg-[#B6FF3C] transition-colors"
            >
              <Download className="w-4 h-4" />
              Download the Panel
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-[13px] font-medium text-[#9CA3AF] hover:text-white hover:border-white/[0.14] transition-colors"
            >
              All Documentation
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-[820px] mx-auto px-6 py-14 space-y-20">

        {/* ── Overview ── */}
        <section>
          <SectionHeading>Overview</SectionHeading>
          <Lead>
            The Prysmor panel is a{" "}
            <strong className="text-[#D1D5DB]">
              Common Extensibility Platform (CEP) extension
            </strong>{" "}
            — the same technology used by Adobe-built panels. Installation requires two things:
            enabling debug mode (so unsigned extensions load) and copying the panel folder to the
            right location.
          </Lead>

          <div className="grid sm:grid-cols-3 gap-3 mb-8">
            {[
              {
                icon: Download,
                title: "Download",
                desc: "Get the ZIP for your OS from the dashboard",
              },
              {
                icon: FolderOpen,
                title: "Copy Folder",
                desc: "Extract and move prysmor-panel/ to the CEP extensions directory",
              },
              {
                icon: Monitor,
                title: "Open Panel",
                desc: "Restart Premiere → Window → Extensions → Prysmor",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-[10px] border border-white/[0.07] bg-[#111113] p-4"
              >
                <div className="w-8 h-8 rounded-[7px] bg-[#A3FF12]/[0.07] border border-[#A3FF12]/15 flex items-center justify-center mb-3">
                  <Icon className="w-4 h-4 text-[#A3FF12]" />
                </div>
                <p className="text-[13px] font-semibold text-white mb-1">{title}</p>
                <p className="text-[12px] text-[#6B7280] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <InfoBox type="tip">
            <strong className="text-[#D1D5DB]">Demo mode:</strong> This build requires no API key
            or login inside the panel. Click &quot;Continue to Prysmor&quot; and start testing
            immediately.
          </InfoBox>
        </section>

        {/* ── Windows ── */}
        <section>
          <div className="flex items-center gap-2.5 mb-2">
            <Monitor className="w-5 h-5 text-[#6B7280]" />
            <SectionHeading>Windows Installation</SectionHeading>
          </div>
          <Lead>Tested on Windows 10 and Windows 11 with Premiere Pro 2020–2024.</Lead>

          <div className="mb-8">
            <StepCard n={1} title="Enable unsigned extension loading">
              <p>
                Open <strong className="text-white">PowerShell</strong> (no admin required) and run:
              </p>
              <CodeBlock>{`Set-ItemProperty -Path "HKCU:\\Software\\Adobe\\CSXS.10" -Name "PlayerDebugMode" -Value 1`}</CodeBlock>
              <p>
                If you&apos;re on Premiere 2022 or later, also run the CSXS.11 variant:
              </p>
              <CodeBlock>{`Set-ItemProperty -Path "HKCU:\\Software\\Adobe\\CSXS.11" -Name "PlayerDebugMode" -Value 1`}</CodeBlock>
              <p className="text-[12px] text-[#4B5563]">
                Alternatively, use Registry Editor (Win+R → regedit) and navigate to{" "}
                <CodeLine>HKEY_CURRENT_USER\Software\Adobe\CSXS.10</CodeLine> — add a{" "}
                <CodeLine>DWORD</CodeLine> named <CodeLine>PlayerDebugMode</CodeLine> with value{" "}
                <CodeLine>1</CodeLine>.
              </p>
            </StepCard>

            <StepCard n={2} title="Download and extract">
              <p>
                Go to{" "}
                <Link href="/dashboard/downloads" className="text-[#A3FF12] hover:underline underline-offset-2">
                  Dashboard → Downloads
                </Link>{" "}
                and download <CodeLine>prysmor-panel-win.zip</CodeLine>. Extract it to get the
                folder <CodeLine>prysmor-panel/</CodeLine>.
              </p>
            </StepCard>

            <StepCard n={3} title="Copy to extensions directory">
              <p>Copy the extracted folder to:</p>
              <CodeBlock>{`C:\\Users\\<your-username>\\AppData\\Roaming\\Adobe\\CEP\\extensions\\prysmor-panel\\`}</CodeBlock>
              <p>
                The <CodeLine>AppData</CodeLine> folder is hidden by default. In File Explorer:
                View → Show → Hidden items, or paste the path directly into the address bar.
              </p>
              <p className="text-[12px] text-[#4B5563]">
                The folder name must be <strong className="text-[#D1D5DB]">exactly</strong>{" "}
                <CodeLine>prysmor-panel</CodeLine>.
              </p>
            </StepCard>

            <StepCard n={4} title="Restart Premiere Pro">
              <p>Fully close Adobe Premiere Pro (not just the project) and reopen it.</p>
            </StepCard>

            <StepCard n={5} title="Open the Prysmor panel">
              <p>
                In Premiere Pro: <strong className="text-white">Window → Extensions → Prysmor</strong>
              </p>
              <p>Click <strong className="text-white">Continue to Prysmor</strong> to enter demo mode.</p>
            </StepCard>
          </div>

          <ScreenshotPlaceholder label="Windows: Registry Editor with PlayerDebugMode = 1" />
        </section>

        {/* ── macOS ── */}
        <section>
          <div className="flex items-center gap-2.5 mb-2">
            <Terminal className="w-5 h-5 text-[#6B7280]" />
            <SectionHeading>macOS Installation</SectionHeading>
          </div>
          <Lead>Tested on macOS 11+ (Big Sur, Monterey, Ventura, Sonoma) with Premiere Pro 2020–2024.</Lead>

          <div className="mb-8">
            <StepCard n={1} title="Enable unsigned extension loading">
              <p>Open <strong className="text-white">Terminal</strong> and run:</p>
              <CodeBlock>{`defaults write com.adobe.CSXS.10 PlayerDebugMode 1`}</CodeBlock>
              <p>For Premiere 2022+, also run:</p>
              <CodeBlock>{`defaults write com.adobe.CSXS.11 PlayerDebugMode 1`}</CodeBlock>
            </StepCard>

            <StepCard n={2} title="Download and extract">
              <p>
                Download <CodeLine>prysmor-panel-mac.zip</CodeLine> from{" "}
                <Link href="/dashboard/downloads" className="text-[#A3FF12] hover:underline underline-offset-2">
                  Dashboard → Downloads
                </Link>{" "}
                and double-click to extract.
              </p>
            </StepCard>

            <StepCard n={3} title="Copy to extensions directory">
              <p>Move the <CodeLine>prysmor-panel/</CodeLine> folder to:</p>
              <CodeBlock>{`~/Library/Application Support/Adobe/CEP/extensions/prysmor-panel/`}</CodeBlock>
              <p>
                Quick access: In Finder press{" "}
                <strong className="text-white">Cmd+Shift+G</strong> and paste the path above.
              </p>
              <p className="text-[12px] text-[#4B5563]">
                If <CodeLine>CEP/extensions/</CodeLine> doesn&apos;t exist, create it.
              </p>
            </StepCard>

            <StepCard n={4} title="Restart Premiere Pro">
              <p>
                Quit Premiere Pro completely (<strong className="text-white">Cmd+Q</strong>) and
                relaunch it.
              </p>
            </StepCard>

            <StepCard n={5} title="Open the Prysmor panel">
              <p>
                <strong className="text-white">Window → Extensions → Prysmor</strong>
              </p>
            </StepCard>
          </div>

          <ScreenshotPlaceholder label="macOS: Terminal running defaults write com.adobe.CSXS.10 PlayerDebugMode 1" />
        </section>

        {/* ── First Use ── */}
        <section>
          <SectionHeading>First Use (Demo Mode)</SectionHeading>
          <Lead>What to expect after the panel opens.</Lead>

          <div className="space-y-3 mb-8">
            {[
              {
                title: "Login screen",
                desc: "Shows a \"Continue to Prysmor\" button. No API key or password needed.",
              },
              {
                title: "Generate VFX",
                desc: "Type any prompt, choose aspect ratio and duration, click Generate. A ~9-second progress animation runs.",
              },
              {
                title: "Result card",
                desc: "Shows a thumbnail (SVG placeholder). Import and Insert buttons become active.",
              },
              {
                title: "Import to Project",
                desc: "Calls Premiere's importFiles() on the bundled demo clip. Requires a real MP4 — see below.",
              },
              {
                title: "Insert to Timeline",
                desc: "Imports and places the clip at the current playhead. A sequence must be open.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="flex gap-3 rounded-[10px] border border-white/[0.06] bg-[#111113] px-4 py-3.5"
              >
                <CheckCircle2 className="w-4 h-4 text-[#A3FF12]/60 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-medium text-[#D1D5DB] mb-0.5">{item.title}</p>
                  <p className="text-[12px] text-[#6B7280] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <InfoBox type="warn">
            <strong className="text-[#D1D5DB]">Replace the demo clip:</strong> The bundled file at{" "}
            <CodeLine>panel/assets/prysmor-demo.mp4</CodeLine> is a text placeholder.
            Replace it with a real H.264 MP4 (1920×1080, 4–8 sec) for Import and Insert to work.
          </InfoBox>
        </section>

        {/* ── Troubleshooting ── */}
        <section>
          <SectionHeading>Troubleshooting</SectionHeading>
          <Lead>Common issues and fixes.</Lead>

          <div className="space-y-4">
            {[
              {
                q: "Prysmor doesn't appear in Window → Extensions",
                a: [
                  "Confirm PlayerDebugMode = 1 is set for the correct CSXS version (try both CSXS.10 and CSXS.11).",
                  "The folder inside extensions/ must be named exactly prysmor-panel.",
                  "Make sure CSXS/manifest.xml is present inside the folder.",
                  "Restart Premiere Pro completely after copying the folder.",
                ],
              },
              {
                q: "Import to Project / Insert fails with 'file not found'",
                a: [
                  "The bundled prysmor-demo.mp4 is a placeholder text file — replace it with a real MP4.",
                  "The panel shows the exact ExtendScript error in a red toast message.",
                ],
              },
              {
                q: "Insert to Timeline shows 'No active sequence'",
                a: [
                  "Open a sequence in the Premiere Timeline panel before clicking Insert to Timeline.",
                ],
              },
              {
                q: "The panel appears blank / white",
                a: [
                  "The manifest.xml sets --allow-file-access-from-files which is required for loading local assets.",
                  "Try removing and re-copying the extension folder, then restarting Premiere.",
                ],
              },
            ].map((item, i) => (
              <div
                key={i}
                className="rounded-[10px] border border-white/[0.07] bg-[#111113] p-5"
              >
                <div className="flex gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-[#F59E0B] flex-shrink-0 mt-0.5" />
                  <p className="text-[13px] font-semibold text-white">{item.q}</p>
                </div>
                <ul className="space-y-1.5 pl-6">
                  {item.a.map((answer, j) => (
                    <li key={j} className="text-[12px] text-[#6B7280] leading-relaxed list-disc">
                      {answer}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── Next Steps ── */}
        <section>
          <SectionHeading>Next Steps</SectionHeading>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              {
                href: "/dashboard/downloads",
                label: "Download Page",
                desc: "Windows and macOS ZIPs + full install steps",
              },
              {
                href: "/dashboard/docs",
                label: "Dashboard Docs",
                desc: "API reference and panel configuration",
              },
              {
                href: "/dashboard/plugin",
                label: "Plugin Settings",
                desc: "Manage connected panels and devices",
              },
              {
                href: "/docs",
                label: "All Documentation",
                desc: "CutSync, MotionForge, and more",
              },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex items-start justify-between rounded-[10px] border border-white/[0.07] bg-[#111113] p-4 hover:border-white/[0.12] hover:bg-white/[0.02] transition-all"
              >
                <div>
                  <p className="text-[13px] font-semibold text-white mb-0.5">{link.label}</p>
                  <p className="text-[12px] text-[#6B7280]">{link.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#4B5563] group-hover:text-[#9CA3AF] transition-colors flex-shrink-0 mt-0.5 ml-2" />
              </Link>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}
