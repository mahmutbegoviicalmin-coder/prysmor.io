"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, X, LayoutDashboard } from "lucide-react";
import { track, trackCta, trackNav } from "@/lib/track";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "How it Works", href: "/#how-it-works", id: "how_it_works" },
  { label: "Capabilities", href: "/#examples", id: "capabilities" },
  { label: "Pricing", href: "/#pricing", id: "pricing" },
  { label: "FAQ", href: "/#faq", id: "faq" },
];

const ease = [0.22, 1, 0.36, 1] as const;

function NavLink({ href, label, id }: { href: string; label: string; id: string }) {
  return (
    <Link
      href={href}
      onClick={() => trackNav(id, "navbar")}
      className="group relative px-3.5 py-2 text-[13px] font-medium tracking-[-0.015em] text-white/38 transition-colors duration-200 hover:text-white/90"
    >
      {label}
      <span
        className="absolute inset-x-3.5 -bottom-px h-px bg-white/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        aria-hidden
      />
    </Link>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => {
        if (!cancelled) setIsSignedIn(r.ok);
      })
      .catch(() => {
        if (!cancelled) setIsSignedIn(false);
      });
    return () => { cancelled = true; };
  }, [pathname]);

  const handleSignUp = () => {
    trackCta("navbar", "get_lifetime");
    window.location.href = "/checkout";
  };

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 16);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-[100] px-4 pt-2.5 sm:px-6 sm:pt-3">
        <div
          className={cn(
            "pointer-events-auto relative mx-auto flex h-14 max-w-[1400px] items-center justify-between overflow-hidden rounded-xl px-5 transition-all duration-300 lg:px-6",
            scrolled || isHome
              ? "border border-white/[0.08] bg-[#080808]/90 shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl"
              : "border border-transparent bg-transparent shadow-none",
          )}
        >
          {(scrolled || isHome) && (
            <>
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{
                  background:
                    "radial-gradient(ellipse 60% 70% at 50% -30%, rgba(57,255,106,0.03) 0%, transparent 70%)",
                }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                aria-hidden
              />
            </>
          )}

          <Link
            href="/"
            className="relative flex shrink-0 items-center gap-2 focus-visible:outline-none"
          >
            <Image
              src="/logo/logo-icon.png"
              alt="Prysmor"
              width={24}
              height={24}
              className="h-6 w-6 object-contain"
              priority
            />
            <span className="text-[16px] font-semibold tracking-[-0.03em] text-white">
              Prysmor
            </span>
          </Link>

          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center lg:flex">
            {navLinks.map((l) => (
              <NavLink key={l.href} href={l.href} label={l.label} id={l.id} />
            ))}
          </nav>

          <div className="relative hidden items-center gap-4 lg:flex">
            {isSignedIn ? (
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium tracking-[-0.015em] text-white/45 transition-colors duration-200 hover:text-white/85"
              >
                <LayoutDashboard className="h-3.5 w-3.5 text-white/35" />
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  onClick={() => track("sign_in_navbar")}
                  className="cursor-pointer px-1 text-[13px] font-medium tracking-[-0.015em] text-white/40 transition-colors duration-200 hover:text-white/80"
                >
                  Sign In
                </Link>
                <button
                  type="button"
                  onClick={handleSignUp}
                  className="inline-flex cursor-pointer items-center rounded-md bg-[#39FF6A] px-3 py-1.5 text-[12px] font-semibold tracking-[-0.01em] text-black transition-opacity duration-200 hover:opacity-90"
                >
                  Get lifetime access
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            className="relative flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.07] text-white/40 transition-colors duration-200 hover:border-white/[0.12] hover:text-white/80 lg:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            <AnimatePresence mode="wait" initial={false}>
              {mobileOpen ? (
                <motion.span
                  key="x"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  className="flex"
                >
                  <X className="h-4 w-4" />
                </motion.span>
              ) : (
                <motion.span
                  key="menu"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  className="flex"
                >
                  <Menu className="h-4 w-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease }}
              className="fixed inset-x-4 z-40 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/95 shadow-[0_24px_64px_rgba(0,0,0,0.8)] backdrop-blur-2xl lg:hidden"
              style={{ top: "calc(74px + 8px)" }}
            >
              <div className="space-y-0.5 p-4">
                {navLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => {
                      trackNav(l.id, "mobile_nav");
                      setMobileOpen(false);
                    }}
                    className={cn(
                      "block rounded-lg px-3 py-2.5 text-[14px] font-medium tracking-[-0.015em] transition-colors duration-200",
                      pathname === l.href
                        ? "bg-white/[0.05] text-white"
                        : "text-white/42 hover:bg-white/[0.03] hover:text-white/85",
                    )}
                  >
                    {l.label}
                  </Link>
                ))}

                <div className="mt-3 flex flex-col gap-2 border-t border-white/[0.06] pt-3">
                  {isSignedIn ? (
                    <Link
                      href="/dashboard"
                      onClick={() => trackNav("dashboard", "mobile_nav")}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
                    >
                      <LayoutDashboard className="h-4 w-4 text-white/35" />
                      <span className="text-[14px] font-medium text-white/85">Dashboard</span>
                    </Link>
                  ) : (
                    <>
                      <Link
                        href="/sign-in"
                        onClick={() => {
                          track("sign_in_mobile_nav");
                          setMobileOpen(false);
                        }}
                        className="w-full rounded-lg py-2.5 text-center text-[14px] font-medium text-white/42 transition-colors hover:text-white/80"
                      >
                        Sign In
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setMobileOpen(false);
                          handleSignUp();
                        }}
                        className="w-full rounded-lg bg-[#39FF6A] py-2 text-[13px] font-semibold text-black transition-opacity hover:opacity-90"
                      >
                        Get lifetime access
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
