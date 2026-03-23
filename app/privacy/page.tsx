import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Prysmor",
  description: "Learn how Prysmor collects, uses, and protects your personal information.",
};

const LAST_UPDATED = "March 17, 2026";

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="text-[13px] text-ink-faint">
            Last updated: <span className="text-ink-muted">{LAST_UPDATED}</span>
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-12">

          <Section title="1. Introduction">
            <P>
              Prysmor (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is committed to protecting
              your personal information. This Privacy Policy explains what data we collect, how we use
              it, and your rights in relation to it when you use VFXPilot or any of our services.
            </P>
            <P>
              By using our services, you agree to the collection and use of information as described
              in this policy.
            </P>
          </Section>

          <Section title="2. Information We Collect">
            <P>We collect only the information necessary to provide and improve our services.</P>

            <SubSection title="Account Information">
              <UL>
                <LI>Full name</LI>
                <LI>Email address</LI>
                <LI>Account password (stored in encrypted form, we never see your plain-text password)</LI>
              </UL>
            </SubSection>

            <SubSection title="Billing Information">
              <UL>
                <LI>Billing name and address</LI>
                <LI>Payment method details (e.g., card type, last 4 digits)</LI>
              </UL>
              <P>
                Full payment card details are processed and stored exclusively by our payment
                processor, Lemon Squeezy. Prysmor does not store or have direct access to your
                complete card information.
              </P>
            </SubSection>
          </Section>

          <Section title="3. How We Use Your Information">
            <P>We use the information we collect for the following purposes:</P>
            <UL>
              <LI>To create and manage your Prysmor account</LI>
              <LI>To process subscription payments and send billing-related communications</LI>
              <LI>To deliver and maintain VFXPilot and related services</LI>
              <LI>To respond to support requests and customer inquiries</LI>
              <LI>To send important service updates, security notices, and policy changes</LI>
              <LI>To comply with legal obligations</LI>
            </UL>
            <P>
              We do not sell, rent, or trade your personal information to any third parties for
              marketing purposes.
            </P>
          </Section>

          <Section title="4. Third-Party Services">
            <P>
              We work with the following third-party provider who may process your data on our behalf:
            </P>

            <SubSection title="Lemon Squeezy (Payment Processing)">
              <P>
                Lemon Squeezy handles all payment transactions for Prysmor. When you purchase a
                subscription, your billing details are collected and processed directly by Lemon
                Squeezy in accordance with their own privacy policy and applicable financial
                regulations. We receive only a transaction confirmation and limited billing metadata.
              </P>
              <P>
                For more information on how Lemon Squeezy handles your data, please review their
                Privacy Policy at:{" "}
                <a
                  href="https://www.lemonsqueezy.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:opacity-75 transition-opacity"
                >
                  lemonsqueezy.com/privacy
                </a>
              </P>
            </SubSection>
          </Section>

          <Section title="5. Data Retention">
            <P>
              We retain your personal data for as long as your account is active or as needed to
              provide you with our services. If you cancel your subscription or request account
              deletion, we will delete or anonymize your personal data within a reasonable timeframe,
              except where we are required to retain it for legal, tax, or compliance purposes.
            </P>
          </Section>

          <Section title="6. Data Security">
            <P>
              We take reasonable technical and organizational measures to protect your personal
              information against unauthorized access, loss, or misuse. These measures include
              encrypted storage of passwords and secure transmission of data via HTTPS.
            </P>
            <P>
              However, no method of transmission over the internet is 100% secure. While we strive to
              use commercially acceptable means to protect your data, we cannot guarantee absolute
              security.
            </P>
          </Section>

          <Section title="7. Your Rights">
            <P>
              Depending on your location, you may have certain rights regarding your personal data,
              including:
            </P>
            <UL>
              <LI>The right to access the personal data we hold about you</LI>
              <LI>The right to request correction of inaccurate data</LI>
              <LI>The right to request deletion of your personal data</LI>
              <LI>The right to withdraw consent where processing is based on consent</LI>
            </UL>
            <P>
              To exercise any of these rights, please contact us at{" "}
              <a href="mailto:support@prysmor.io" className="text-accent hover:opacity-75 transition-opacity">
                support@prysmor.io
              </a>
              . We will respond to your request within a reasonable timeframe.
            </P>
          </Section>

          <Section title="8. Children's Privacy">
            <P>
              Our services are not directed to individuals under the age of 13. We do not knowingly
              collect personal information from children. If you believe that a child has provided us
              with personal information, please contact us and we will take steps to delete such
              information promptly.
            </P>
          </Section>

          <Section title="9. Changes to This Privacy Policy">
            <P>
              We may update this Privacy Policy from time to time. When we do, the &quot;Last
              updated&quot; date at the top of this page will be revised. We encourage you to review
              this policy periodically. Your continued use of our services after any changes
              constitutes your acceptance of the updated policy.
            </P>
          </Section>

          <Section title="10. Contact">
            <P>
              If you have any questions, concerns, or requests related to this Privacy Policy, please
              contact us:
            </P>
            <P>
              Email:{" "}
              <a href="mailto:support@prysmor.io" className="text-accent hover:opacity-75 transition-opacity">
                support@prysmor.io
              </a>
            </P>
          </Section>

        </div>

        {/* Bottom */}
        <div className="mt-16 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-[12px] text-ink-faint">
            &copy; {new Date().getFullYear()} Prysmor. All rights reserved.
          </p>
          <div className="flex gap-5">
            <Link href="/terms" className="text-[11.5px] text-ink-faint hover:text-ink-muted transition-colors">
              Terms of Service
            </Link>
            <a href="mailto:support@prysmor.io" className="text-[11.5px] text-ink-faint hover:text-ink-muted transition-colors">
              Support
            </a>
          </div>
        </div>

      </div>
    </main>
  );
}

/* ── Layout helpers ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[14px] font-semibold text-white mb-4 pb-3 border-b border-white/[0.06]">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pl-4 border-l border-white/[0.06] space-y-3">
      <p className="text-[12px] font-semibold text-ink-subtle uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[13.5px] text-ink-muted leading-relaxed">{children}</p>;
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2">{children}</ul>;
}

function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-[13.5px] text-ink-muted leading-relaxed">
      <span className="mt-[9px] shrink-0 w-1 h-1 rounded-full bg-white/20" />
      <span>{children}</span>
    </li>
  );
}
