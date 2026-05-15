"use client";

import { motion } from "framer-motion";

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  badge?: string;
  avatar?: string;
}

interface TestimonialsProps {
  title?: string;
  items: Testimonial[];
}

const GREEN = "#39FF6A";

export default function Testimonials({ title = "What creators say", items }: TestimonialsProps) {
  // Duplicate items for seamless loop
  const doubled = [...items, ...items];

  return (
    <section className="relative py-24 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.06]" />

      <div className="mx-auto max-w-[1260px] px-4 sm:px-6 lg:px-10 mb-12">
        <motion.div
          initial={{ opacity: 1, y: 0 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="font-heading text-[32px] sm:text-[42px] font-bold text-white tracking-[-0.03em]">
            {title}
          </h2>
        </motion.div>
      </div>

      {/* Ticker row */}
      <div
        className="relative w-full overflow-hidden"
        style={{ maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)" }}
      >
        <div
          className="flex gap-4 w-max"
          style={{ animation: "ticker 36s linear infinite" }}
        >
          {doubled.map((t, i) => (
            <div
              key={i}
              className="w-[320px] flex-shrink-0 rounded-[20px] border border-white/[0.07] bg-[#0f0f0f] p-6 flex flex-col gap-4"
            >
              {/* Stars */}
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, s) => (
                  <svg key={s} className="w-3.5 h-3.5" fill={GREEN} viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              {t.badge && (
                <span
                  className="self-start text-[10px] font-semibold tracking-wide rounded-[100px] px-3 py-1"
                  style={{
                    color: GREEN,
                    background: "rgba(57,255,106,0.08)",
                    border: "1px solid rgba(57,255,106,0.18)",
                  }}
                >
                  {t.badge}
                </span>
              )}

              <p className="text-[13px] text-ink-subtle leading-relaxed flex-1 font-light">
                &ldquo;{t.quote}&rdquo;
              </p>

              <div className="flex items-center gap-2.5 pt-1">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                  style={{
                    background: "rgba(57,255,106,0.10)",
                    border: "1px solid rgba(57,255,106,0.20)",
                    color: GREEN,
                  }}
                >
                  {t.name[0]}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white leading-tight">{t.name}</p>
                  <p className="text-[11px] text-ink-faint font-light">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
