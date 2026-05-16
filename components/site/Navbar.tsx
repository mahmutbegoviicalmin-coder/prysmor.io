"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, X, LayoutDashboard, ArrowRight } from "lucide-react";
import { useAuth, useClerk, UserButton } from "@clerk/nextjs";
import { track } from "@/lib/track";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const GREEN = "#39FF6A";

const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "Examples", href: "/#examples" },
  { label: "Pricing",  href: "/#pricing"  },
  { label: "FAQ",      href: "/#faq"      },
];

const ease = [0.22, 1, 0.36, 1] as const;

export default function Navbar() {
  const [scrolled,   setScrolled]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname  = usePathname();
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();

  const handleSignIn = () => openSignIn({ afterSignInUrl: "https://prysmor.io/dashboard" });
  const handleSignUp = () => {
    track('cta_click', { location: 'navbar' });
    const pricingEl = document.getElementById("pricing");
    if (pricingEl) {
      pricingEl.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = "/#pricing";
    }
  };

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      <header
        className="fixed inset-x-0 z-[100] transition-all duration-[250ms] ease"
        style={scrolled ? {
          top: "var(--bar-h, 0px)",
          background: "rgba(8,8,8,0.9)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid #111",
        } : {
          top: "var(--bar-h, 0px)",
          background: "transparent",
        }}
      >
        <div
          className="flex items-center justify-between w-full"
          style={{ padding: "20px 40px" }}
        >
          {/* Logo — icon + text */}
          <Link href="/" className="flex items-center gap-2 focus-visible:outline-none flex-shrink-0">
            <Image
              src="/logo/logo-icon.png"
              alt="Prysmor"
              width={28}
              height={28}
              className="w-7 h-7 object-contain"
              priority
            />
            <span
              className="font-bold text-white"
              style={{ fontSize: "18px", letterSpacing: "-0.5px" }}
            >
              Prysmor
            </span>
          </Link>

          {/* Desktop nav — floating pill */}
          <nav
            className="hidden lg:inline-flex items-center"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              borderRadius: "100px",
              padding: "5px",
              gap: "2px",
            }}
          >
            {navLinks.map((l) => {
              const isActive = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className="transition-all duration-200"
                  style={{
                    color: isActive ? "white" : "#555",
                    fontSize: "13px",
                    fontWeight: 400,
                    padding: "7px 16px",
                    borderRadius: "100px",
                    background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                      (e.currentTarget as HTMLElement).style.color = "white";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                      (e.currentTarget as HTMLElement).style.color = "#555";
                    }
                  }}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="hidden lg:flex items-center flex-shrink-0" style={{ gap: "20px" }}>
            {isSignedIn ? (
              <>
                <Link
                  href="https://prysmor.io/dashboard"
                  className="flex items-center gap-2 transition-all duration-200"
                  style={{
                    padding: "7px 16px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    fontSize: "13px",
                    color: "rgba(255,255,255,0.7)",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.16)";
                    (e.currentTarget as HTMLElement).style.color = "white";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)";
                  }}
                >
                  <LayoutDashboard className="w-3.5 h-3.5" style={{ color: GREEN }} />
                  Dashboard
                </Link>
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "w-8 h-8 rounded-[9px] ring-1 ring-white/[0.10] hover:ring-[#39FF6A]/40 transition-all",
                    },
                  }}
                />
              </>
            ) : (
              <>
                {/* Sign in */}
                <button
                  onClick={handleSignIn}
                  className="transition-colors duration-200 cursor-pointer"
                  style={{
                    fontSize: "13px",
                    fontWeight: 400,
                    color: "#3a3a3a",
                    background: "none",
                    border: "none",
                    padding: 0,
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#888"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#3a3a3a"; }}
                >
                  Sign in
                </button>

                {/* Get Started CTA */}
                <button
                  onClick={handleSignUp}
                  className="inline-flex items-center gap-1.5 font-bold cursor-pointer transition-colors duration-200"
                  style={{
                    background: GREEN,
                    color: "#000",
                    fontSize: "13px",
                    fontWeight: 700,
                    padding: "10px 20px",
                    borderRadius: "8px",
                    border: "none",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#52ff7e";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = GREEN;
                  }}
                >
                  Get Started
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-full border border-white/[0.08] transition-colors"
            style={{ color: "#666" }}
            onClick={() => setMobileOpen((o) => !o)}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "white"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#666"; }}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            <AnimatePresence mode="wait" initial={false}>
              {mobileOpen ? (
                <motion.span key="x"
                  initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.14 }}
                  className="flex">
                  <X className="w-4 h-4" />
                </motion.span>
              ) : (
                <motion.span key="menu"
                  initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.14 }}
                  className="flex">
                  <Menu className="w-4 h-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease }}
              className="fixed inset-x-3 z-40 lg:hidden rounded-[20px] border border-white/[0.09] backdrop-blur-2xl shadow-[0_32px_80px_rgba(0,0,0,0.85)] overflow-hidden"
              style={{ background: "rgba(8,8,8,0.99)", top: "calc(76px + var(--bar-h, 0px))" }}
            >
              <div className="h-px" style={{ background: `linear-gradient(90deg,transparent,${GREEN}50 40%,${GREEN}50 60%,transparent)` }} />
              <div className="p-5 space-y-1">
                {navLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={cn(
                      "block px-3 py-3 rounded-[12px] text-[14px] font-medium transition-colors",
                      pathname === l.href
                        ? "text-white bg-white/[0.06]"
                        : "text-[#666] hover:text-white hover:bg-white/[0.04]",
                    )}
                  >
                    {l.label}
                  </Link>
                ))}
                <div className="!mt-5 flex flex-col gap-2.5">
                  {isSignedIn ? (
                    <Link
                      href="https://prysmor.io/dashboard"
                      className="flex items-center gap-3 px-4 py-3 rounded-[14px] border border-white/[0.08] hover:border-white/[0.16] transition-all"
                    >
                      <LayoutDashboard className="w-4 h-4" style={{ color: GREEN }} />
                      <span className="text-[14px] font-semibold text-white">Dashboard</span>
                    </Link>
                  ) : (
                    <>
                      <button
                        onClick={() => { setMobileOpen(false); handleSignIn(); }}
                        className="w-full py-3 rounded-[12px] text-[14px] font-medium border border-white/[0.08] text-[#666] hover:text-white hover:border-white/[0.16] transition-all"
                      >
                        Sign in
                      </button>
                      <button
                        onClick={() => { setMobileOpen(false); handleSignUp(); }}
                        className="w-full py-3 rounded-[12px] text-[14px] font-bold flex items-center justify-center gap-2 transition-all"
                        style={{ background: GREEN, color: "#000" }}
                      >
                        Get Started <ArrowRight className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
