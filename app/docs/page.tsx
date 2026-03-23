import type { Metadata } from "next";
import { BookOpen, PanelLeft, Wand2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Docs",
  description: "Prysmor documentation — install the VFXPilot panel and start generating AI VFX inside Adobe Premiere Pro.",
};

const sections = [
  { icon: PanelLeft, title: "Panel Installation", desc: "Install the Prysmor panel inside Premiere Pro on Windows or macOS.", href: "#install" },
  { icon: Wand2,     title: "VFXPilot Guide",     desc: "Writing prompts, generating effects, and inserting results into your timeline.", href: "#vfxpilot" },
];

const installSteps = [
  "Download the Prysmor panel installer from your dashboard.",
  "Run the installer and follow the on-screen prompts.",
  "Restart Adobe Premiere Pro.",
  "Open the panel: Window → Extensions → Prysmor.",
  "Sign in with your Prysmor account to sync your plan.",
  "VFXPilot appears in the panel automatically.",
];

const vfxpilotSteps = [
  "Select a clip in your Premiere Pro timeline.",
  'Click "Select Clip" in the VFXPilot panel to load it.',
  'Type your effect prompt, or use "AI Enhance" to generate one based on your scene.',
  'Click "Generate Effect" and wait for the AI to process your clip.',
  'Once done, click "Insert to Timeline" to place the result on V2.',
];

export default function DocsPage() {
  return (
    <div className="pt-[64px] min-h-screen">
      <div className="mx-auto max-w-container-sm px-4 sm:px-6 lg:px-8 py-20">

        <div className="mb-14">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-accent" />
            <p className="text-[11px] font-semibold text-accent/70 tracking-widest2 uppercase">Documentation</p>
          </div>
          <h1 className="font-heading text-[36px] sm:text-[46px] font-bold text-white tracking-tight mb-4">
            Prysmor Docs
          </h1>
          <p className="text-ink-muted text-[15px] max-w-md leading-relaxed">
            Everything you need to install the panel and generate cinematic VFX directly inside Adobe Premiere Pro.
          </p>
        </div>

        {/* Quick nav */}
        <div className="grid sm:grid-cols-2 gap-4 mb-16">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <a key={s.title} href={s.href}
                className="rounded-[16px] border border-white/[0.07] bg-surface-1 p-5 hover:border-white/[0.14] hover:-translate-y-0.5 transition-all duration-200">
                <div className="w-8 h-8 rounded-lg bg-accent/[0.08] border border-accent/18 flex items-center justify-center mb-3">
                  <Icon className="w-4 h-4 text-accent" />
                </div>
                <p className="text-[14px] font-semibold text-white mb-1">{s.title}</p>
                <p className="text-[12px] text-ink-subtle leading-relaxed">{s.desc}</p>
              </a>
            );
          })}
        </div>

        {/* Installation */}
        <section id="install" className="mb-14">
          <h2 className="font-heading text-[22px] font-bold text-white mb-6">Panel Installation</h2>
          <div className="rounded-[16px] border border-white/[0.07] bg-surface-1 p-6 mb-4">
            <h3 className="font-heading text-[15px] font-semibold text-white mb-3">Requirements</h3>
            <ul className="space-y-1.5 text-[13px] text-ink-subtle">
              <li>Adobe Premiere Pro CC 2022 or later</li>
              <li>Windows 10/11 or macOS 12 Monterey+</li>
              <li>Active Prysmor account (any plan)</li>
              <li>Internet connection for authentication</li>
            </ul>
          </div>
          <div className="rounded-[16px] border border-white/[0.07] bg-surface-1 p-6">
            <h3 className="font-heading text-[15px] font-semibold text-white mb-5">Steps</h3>
            <ol className="space-y-4">
              {installSteps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full border border-accent/22 bg-accent/[0.07] flex items-center justify-center text-[11px] font-semibold text-accent">
                    {i + 1}
                  </span>
                  <span className="text-[13px] text-ink-subtle leading-relaxed pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* VFXPilot Guide */}
        <section id="vfxpilot" className="mb-14">
          <h2 className="font-heading text-[22px] font-bold text-white mb-6">VFXPilot Guide</h2>
          <div className="rounded-[16px] border border-white/[0.07] bg-surface-1 p-6 mb-4">
            <h3 className="font-heading text-[15px] font-semibold text-white mb-3">How it works</h3>
            <p className="text-[13px] text-ink-subtle leading-relaxed">
              VFXPilot uses state-of-the-art AI video generation to transform your footage based on
              a text prompt — directly inside Premiere Pro. Your clip is uploaded securely, processed
              by the AI, and the result is inserted back into your timeline in seconds.
            </p>
          </div>
          <div className="rounded-[16px] border border-white/[0.07] bg-surface-1 p-6 mb-4">
            <h3 className="font-heading text-[15px] font-semibold text-white mb-5">Generating an effect</h3>
            <ol className="space-y-4">
              {vfxpilotSteps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full border border-accent/22 bg-accent/[0.07] flex items-center justify-center text-[11px] font-semibold text-accent">
                    {i + 1}
                  </span>
                  <span className="text-[13px] text-ink-subtle leading-relaxed pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-[16px] border border-white/[0.07] bg-surface-1 p-6">
            <h3 className="font-heading text-[15px] font-semibold text-white mb-3">Prompt tips</h3>
            <ul className="space-y-2.5 text-[13px] text-ink-subtle">
              <li className="flex gap-2"><span className="text-accent mt-0.5">✦</span> Keep prompts focused — 2 to 3 key effects work best.</li>
              <li className="flex gap-2"><span className="text-accent mt-0.5">✦</span> Use "AI Enhance" to let the AI analyse your scene and write the prompt for you.</li>
              <li className="flex gap-2"><span className="text-accent mt-0.5">✦</span> For background changes (e.g. winter, sunset), identity preservation is applied automatically.</li>
              <li className="flex gap-2"><span className="text-accent mt-0.5">✦</span> For overlay effects (e.g. rain, fireworks), the AI applies them directly without altering faces.</li>
            </ul>
          </div>
        </section>

        {/* Support */}
        <div className="rounded-[16px] border border-white/[0.07] bg-surface-1 p-6 text-center">
          <p className="text-[13px] text-ink-muted mb-1">Need help? We&apos;re here.</p>
          <a href="mailto:support@prysmor.io" className="text-[13px] text-accent hover:opacity-75 transition-opacity">
            support@prysmor.io
          </a>
        </div>

      </div>
    </div>
  );
}
