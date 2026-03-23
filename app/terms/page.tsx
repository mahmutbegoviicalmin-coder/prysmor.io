import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Prysmor",
  description: "Read Prysmor's Terms of Service for VFXPilot and all products.",
};

const LAST_UPDATED = "March 17, 2026";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-24 sm:py-32">

        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[12px] text-ink-faint hover:text-ink-muted transition-colors mb-12"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to Prysmor
        </Link>

        {/* Header */}
        <div className="mb-14">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.07] mb-6">
            <span className="text-[11px] text-ink-faint uppercase tracking-widest font-medium">Legal</span>
          </div>
          <h1 className="text-[32px] sm:text-[40px] font-bold text-white tracking-tight leading-tight mb-4">
            Terms of Service
          </h1>
          <p className="text-[13px] text-ink-faint">
            Last updated: <span className="text-ink-muted">{LAST_UPDATED}</span>
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-12">

          <Section title="1. Agreement to Terms">
            <P>
              By accessing or using Prysmor products and services (including VFXPilot) you agree to
              be bound by these Terms of Service. If you do not agree to these terms, please do not use
              our products.
            </P>
          </Section>

          <Section title="2. Use License">
            <P>
              Upon subscribing, Prysmor grants you a personal, non-transferable license to use VFXPilot
              for the duration of your active subscription, subject to the following conditions:
            </P>
            <UL>
              <LI>Your license is valid only while your subscription remains active and in good standing.</LI>
              <LI>You may not redistribute, resell, share, or transfer your account credentials or license access to any third party.</LI>
              <LI>Access is limited to your personal or business use only.</LI>
              <LI>Prysmor reserves the right to suspend or terminate access for violations of these terms.</LI>
            </UL>
          </Section>

          <Section title="3. Subscription & Billing">
            <P>
              VFXPilot is offered as a recurring subscription product. By subscribing, you agree to the
              following:
            </P>
            <UL>
              <LI>Your subscription is billed on a recurring basis (monthly or annually, depending on your selected plan).</LI>
              <LI>Billing begins on the date of your initial purchase and renews automatically at the end of each billing period.</LI>
              <LI>You may cancel your subscription at any time through your account settings or by contacting support. Cancellation takes effect at the end of your current billing period.</LI>
              <LI>No partial refunds are issued for unused time remaining within an active billing cycle.</LI>
            </UL>
          </Section>

          <Section title="4. Refund Policy">
            <P>
              We stand behind VFXPilot and want you to be satisfied with your purchase. Our refund
              policy is as follows:
            </P>
            <UL>
              <LI>You have 7 days from the date of your first charge to request a refund.</LI>
              <LI>Refunds are granted when the product does not function as described and our support team is unable to resolve the issue within a reasonable timeframe.</LI>
              <LI>
                To request a refund, contact us at{" "}
                <a href="mailto:support@prysmor.io" className="text-accent hover:opacity-75 transition-opacity">support@prysmor.io</a>
                {" "}with your order details and a description of the issue.
              </LI>
              <LI>Subsequent subscription renewals are non-refundable.</LI>
              <LI>Refund requests submitted after the 7-day window will generally not be honored. We may, at our sole discretion, make exceptions on a case-by-case basis.</LI>
            </UL>
          </Section>

          <Section title="5. Acceptable Use">
            <P>
              You agree to use VFXPilot only for lawful purposes and in accordance with these Terms.
              You may not:
            </P>
            <UL>
              <LI>Reverse-engineer, decompile, or attempt to extract the source code of the product.</LI>
              <LI>Use the product in any way that violates applicable laws or regulations.</LI>
              <LI>Attempt to gain unauthorized access to any part of the service or its infrastructure.</LI>
              <LI>Use automated tools to abuse or overload the service.</LI>
            </UL>
          </Section>

          <Section title="6. Disclaimer of Warranties">
            <P>
              VFXPilot is provided on an &quot;as is&quot; and &quot;as available&quot; basis without
              warranties of any kind, either expressed or implied. Prysmor makes no guarantees
              regarding uptime, accuracy, or fitness for a particular purpose, and disclaims all
              warranties to the fullest extent permitted by applicable law.
            </P>
            <P>
              Prysmor is not liable for any data loss, project delays, revenue loss, or other damages
              direct or indirect, arising from the use of or inability to use VFXPilot.
            </P>
          </Section>

          <Section title="7. Changes to These Terms">
            <P>
              Prysmor reserves the right to update or modify these Terms of Service at any time. When
              changes are made, the &quot;Last updated&quot; date at the top of this page will be
              revised accordingly. Your continued use of VFXPilot after any changes constitutes your
              acceptance of the revised terms. We encourage you to review this page periodically.
            </P>
          </Section>

          <Section title="8. Contact">
            <P>If you have any questions about these Terms of Service, please reach out to us:</P>
            <P>
              Email:{" "}
              <a href="mailto:support@prysmor.io" className="text-accent hover:opacity-75 transition-opacity">
                support@prysmor.io
              </a>
            </P>
          </Section>

        </div>

        {/* Bottom */}
        <div className="mt-16 pt-8 border-t border-white/[0.06]">
          <p className="text-[12px] text-ink-faint">
            &copy; {new Date().getFullYear()} Prysmor. All rights reserved.
          </p>
        </div>
      </div>
    </main>
  );
}

/* ── Small layout helpers ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[14px] font-semibold text-white mb-4 pb-3 border-b border-white/[0.06]">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[13.5px] text-ink-muted leading-relaxed">{children}</p>;
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2 mt-2">{children}</ul>;
}

function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-[13.5px] text-ink-muted leading-relaxed">
      <span className="mt-[5px] shrink-0 w-1 h-1 rounded-full bg-white/20" />
      <span>{children}</span>
    </li>
  );
}
