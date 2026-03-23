"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, X, LayoutDashboard, ArrowRight } from "lucide-react";
import { useAuth, useClerk, UserButton } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

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
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const { openSignIn, openSignUp } = useClerk();

  const handleSignIn = () => openSignIn({ afterSignInUrl: "/dashboard" });
  const handleSignUp = () => openSignUp({ afterSignUpUrl: "/dashboard" });

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      <header
        className={cn(
          "fixed top-0 inset-x-0 z-50 transition-all duration-300",
          scrolled
            ? "bg-[rgba(4,4,6,0.90)] backdrop-blur-2xl border-b border-white/[0.06]"
            : "bg-transparent",
        )}
      >
        <div className="mx-auto flex h-[68px] max-w-container items-center justify-between px-5 sm:px-8 lg:px-10">

          {/* ── Logo ── */}
          <Link href="/" className="flex items-center focus-visible:outline-none">
            <Image
              src="/logo/vecilogo.png"
              alt="Prysmor"
              width={150}
              height={150}
              className="h-[52px] w-auto object-contain"
              priority
            />
          </Link>

          {/* ── Desktop nav ── */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "px-4 py-2 text-[14px] font-medium transition-colors rounded-lg",
                  pathname === l.href ? "text-white" : "text-[#8A9BB0] hover:text-white",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* ── Right: auth ── */}
          <div className="hidden lg:flex items-center gap-3">
            {isSignedIn ? (
              <>
                <Link href="/dashboard"
                  className="group/dash relative flex items-center gap-2 px-4 py-2 rounded-[11px] border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-[#A3FF12]/25 transition-all duration-200">
                  <span className="flex items-center justify-center w-5 h-5 rounded-[6px] bg-gradient-to-br from-[#A3FF12]/20 to-[#22FFB0]/10 border border-[#A3FF12]/25 group-hover/dash:from-[#A3FF12]/30 group-hover/dash:to-[#22FFB0]/20 transition-all">
                    <LayoutDashboard className="w-3 h-3 text-[#A3FF12]" />
                  </span>
                  <span className="text-[13.5px] font-semibold text-white/80 group-hover/dash:text-white transition-colors">Dashboard</span>
                </Link>
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "w-8 h-8 rounded-[9px] ring-1 ring-white/[0.10] hover:ring-[#A3FF12]/40 transition-all",
                    },
                  }}
                />
              </>
            ) : (
              <>
                <button
                  onClick={handleSignIn}
                  className="px-4 py-2 text-[14px] font-medium text-[#8A9BB0] hover:text-white transition-colors">
                  Sign in
                </button>
                <button
                  onClick={handleSignUp}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[13px] font-bold text-background transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
                  style={{
                    background: "linear-gradient(135deg,#A3FF12 0%,#22FFB0 100%)",
                    boxShadow: "0 0 20px rgba(163,255,18,0.30)",
                  }}
                >
                  Get Started
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {/* ── Mobile toggle ── */}
          <button
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-full border border-white/[0.08] text-[#8A9BB0] hover:text-white transition-colors"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            <AnimatePresence mode="wait" initial={false}>
              {mobileOpen ? (
                <motion.span key="x"
                  initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.14 }} className="flex">
                  <X className="w-4 h-4" />
                </motion.span>
              ) : (
                <motion.span key="menu"
                  initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.14 }} className="flex">
                  <Menu className="w-4 h-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </header>

      {/* ── Mobile drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease }}
              className="fixed top-[76px] inset-x-3 z-40 lg:hidden rounded-[22px] border border-white/[0.09] bg-[rgba(5,5,8,0.99)] backdrop-blur-2xl shadow-[0_32px_80px_rgba(0,0,0,0.85)] overflow-hidden"
            >
              <div className="h-px" style={{ background: "linear-gradient(90deg,transparent,rgba(163,255,18,0.5) 40%,rgba(34,255,176,0.5) 60%,transparent)" }} />

              <div className="p-5 space-y-1">
                {navLinks.map((l) => (
                  <Link key={l.href} href={l.href}
                    className={cn(
                      "block px-3 py-3 rounded-[12px] text-[14px] font-medium transition-colors",
                      pathname === l.href ? "text-white bg-white/[0.06]" : "text-[#8A9BB0] hover:text-white hover:bg-white/[0.04]",
                    )}>
                    {l.label}
                  </Link>
                ))}

                <div className="!mt-5 flex flex-col gap-2.5">
                  {isSignedIn ? (
                    <Link href="/dashboard"
                      className="group/mdash flex items-center gap-3 px-4 py-3 rounded-[13px] border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-[#A3FF12]/25 transition-all">
                      <span className="flex items-center justify-center w-7 h-7 rounded-[8px] bg-gradient-to-br from-[#A3FF12]/20 to-[#22FFB0]/10 border border-[#A3FF12]/25">
                        <LayoutDashboard className="w-3.5 h-3.5 text-[#A3FF12]" />
                      </span>
                      <span className="text-[14px] font-semibold text-white">Dashboard</span>
                    </Link>
                  ) : (
                    <>
                      <button
                        onClick={() => { setMobileOpen(false); handleSignIn(); }}
                        className="flex items-center justify-center px-4 py-3 rounded-[13px] border border-white/[0.10] text-[14px] font-medium text-[#8A9BB0] hover:text-white hover:bg-white/[0.05] transition-colors w-full">
                        Sign in
                      </button>
                      <button
                        onClick={() => { setMobileOpen(false); handleSignUp(); }}
                        className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-full text-[14px] font-bold text-background w-full"
                        style={{
                          background: "linear-gradient(135deg,#A3FF12 0%,#22FFB0 100%)",
                          boxShadow: "0 0 24px rgba(163,255,18,0.30)",
                        }}>
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
