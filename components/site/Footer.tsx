"use client";

import Link from "next/link";
import Image from "next/image";
import { Instagram } from "lucide-react";

const footerLinks = {
  Product: [
    { label: "Features",  href: "/#features" },
    { label: "Examples",  href: "/#examples" },
    { label: "Pricing",   href: "/#pricing"  },
    { label: "FAQ",       href: "/#faq"      },
  ],
  Support: [
    { label: "Documentation", href: "/docs/install" },
    { label: "Dashboard",     href: "/dashboard"    },
    { label: "Sign In",       href: "/sign-in"      },
    { label: "Get Started",   href: "/sign-up"      },
  ],
  Legal: [
    { label: "Privacy Policy",   href: "/privacy" },
    { label: "Terms of Service", href: "/terms"   },
  ],
};

const socials = [
  { icon: Instagram, href: "https://instagram.com/prysmor.ai", label: "Instagram" },
];

export default function Footer() {
  return (
    <footer style={{ background: "#060606", borderTop: "1px solid #111" }}>
      <div
        className="mx-auto"
        style={{ maxWidth: "1160px", padding: "64px 20px 40px" }}
      >
        {/* Main grid: brand + 3 nav cols */}
        <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: "40px 32px" }}>

          {/* Brand column — full width on mobile */}
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              textDecoration: "none",
            }}>
              <Image
                src="/logo/logo-icon.png"
                alt="Prysmor"
                width={24}
                height={24}
                style={{ objectFit: "contain" }}
              />
              <span style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "white",
                letterSpacing: "-0.5px",
              }}>
                Prysmor
              </span>
            </Link>

            <p style={{
              fontSize: "13px",
              color: "#555",
              fontWeight: 300,
              marginTop: "14px",
              lineHeight: 1.6,
            }}>
              Text to VFX. Inside Adobe. Instantly.
            </p>

            <a
              href="mailto:support@prysmor.io"
              style={{
                display: "block",
                fontSize: "12px",
                color: "#444",
                marginTop: "16px",
                textDecoration: "none",
                transition: "color 200ms",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#39FF6A"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#444"; }}
            >
              support@prysmor.io
            </a>

            <div style={{ display: "flex", gap: "10px", marginTop: "22px" }}>
              {socials.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  style={{
                    width: "32px",
                    height: "32px",
                    border: "1px solid #1a1a1a",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    textDecoration: "none",
                    transition: "border-color 200ms, background 200ms",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "#333";
                    el.style.background = "#111";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "#1a1a1a";
                    el.style.background = "transparent";
                  }}
                >
                  <Icon size={14} color="#444" />
                </a>
              ))}
            </div>
          </div>

          {/* Nav columns */}
          {Object.entries(footerLinks).map(([group, items]) => (
            <div key={group}>
              <p style={{
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "2px",
                color: "#444",
                marginBottom: "18px",
              }}>
                {group}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      style={{
                        fontSize: "13px",
                        color: "#555",
                        fontWeight: 300,
                        display: "block",
                        padding: "5px 0",
                        textDecoration: "none",
                        transition: "color 200ms",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#aaa"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#555"; }}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-col sm:flex-row items-center sm:justify-between"
          style={{
            marginTop: "48px",
            paddingTop: "24px",
            borderTop: "1px solid #0d0d0d",
            gap: "8px",
          }}
        >
          <p style={{ fontSize: "12px", color: "#3a3a3a" }}>
            © {new Date().getFullYear()} Prysmor. All rights reserved.
          </p>
          <p style={{ fontSize: "12px", color: "#3a3a3a" }}>
            Built for creators who ship.
          </p>
        </div>
      </div>
    </footer>
  );
}
