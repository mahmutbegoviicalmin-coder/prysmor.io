import Link from "next/link";
import Image from "next/image";

const footerLinks = {
  Product: [
    { label: "Features",  href: "/#features" },
    { label: "Examples",  href: "/#examples" },
    { label: "Pricing",   href: "/#pricing"  },
    { label: "FAQ",       href: "/#faq"      },
  ],
  Company: [
    { label: "Sign In",     href: "/sign-in"  },
    { label: "Get Started", href: "/sign-up"  },
    { label: "Dashboard",   href: "/dashboard" },
  ],
  Legal: [
    { label: "Privacy Policy",    href: "/privacy" },
    { label: "Terms of Service",  href: "/terms"   },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.05] bg-background pt-16 pb-10">
      <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:grid-cols-4 mb-14">
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 w-fit group">
              <Image
                src="/logo/logo-icon.png"
                alt="Prysmor"
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
              />
              <span
                className="text-[15px] font-bold tracking-[0.18em] text-white/90 group-hover:text-white transition-colors"
                style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
              >
                PRYSMOR
              </span>
            </Link>
            <p className="mt-3 text-[12.5px] text-ink-muted leading-relaxed max-w-[200px]">
              AI-powered VFX directly inside Adobe Premiere Pro.
            </p>
          </div>

          {Object.entries(footerLinks).map(([group, items]) => (
            <div key={group}>
              <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest2 mb-4">{group}</p>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href}
                      className="text-[13px] text-ink-muted hover:text-white transition-colors">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-white/[0.05]">
          <p className="text-[11.5px] text-ink-faint">
            © {new Date().getFullYear()} Prysmor. All rights reserved.
          </p>
          <div className="flex gap-5">
            <a href="mailto:support@prysmor.io" className="text-[11.5px] text-ink-faint hover:text-ink-muted transition-colors">support@prysmor.io</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
