import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Install Guide — Editron",
};

const steps = [
  "Download the Editron panel installer from your dashboard.",
  "Run the installer and follow the on-screen prompts.",
  "Restart Adobe Premiere Pro.",
  "Open the panel: Window \u2192 Extensions \u2192 Editron.",
  "Click Sign In to authenticate with your Editron account.",
  "Your plan syncs automatically. Your engines appear in the panel.",
];

export default function InstallPage() {
  return (
    <section className="py-28 pt-[100px]">
      <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <Link href="/docs" className="text-[12px] text-ink-faint hover:text-ink-muted transition-colors mb-8 inline-flex items-center gap-1.5">
            ← Docs
          </Link>
          <h1 className="font-heading text-[32px] font-bold text-ink tracking-tight mb-3">
            Panel install guide
          </h1>
          <p className="text-ink-muted text-[15px] mb-10">
            Get the Editron panel running inside Premiere in under five minutes.
          </p>

          <div className="rounded-[16px] border border-white/[0.07] bg-surface-1 p-6 mb-5">
            <h2 className="font-heading text-[15px] font-semibold text-ink mb-4">
              Requirements
            </h2>
            <ul className="space-y-1.5 text-[13px] text-ink-subtle">
              <li>Adobe Premiere Pro CC 2022 or later</li>
              <li>Windows 10/11 or macOS 12+</li>
              <li>Active Editron account (any plan)</li>
              <li>Internet connection for authentication</li>
            </ul>
          </div>

          <div className="rounded-[16px] border border-white/[0.07] bg-surface-1 p-6 mb-8">
            <h2 className="font-heading text-[15px] font-semibold text-ink mb-5">
              Installation steps (Windows + macOS)
            </h2>
            <ol className="space-y-4">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full border border-accent/22 bg-accent/[0.07] flex items-center justify-center text-[11px] font-semibold text-accent">
                    {i + 1}
                  </span>
                  <span className="text-[13px] text-ink-subtle leading-relaxed pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard">
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/docs">Back to Docs</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
