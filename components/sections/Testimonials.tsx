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

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function Testimonials({ title = "What creators say", items }: TestimonialsProps) {
  return (
    <section className="relative py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
      <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <h2 className="font-heading text-[28px] sm:text-[36px] font-bold text-white tracking-tight">{title}</h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.06] rounded-[20px] overflow-hidden border border-white/[0.06]">
          {items.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.06, ease }}
              className="bg-[#0a0b0d] p-6 flex flex-col gap-4"
            >
              {/* Stars */}
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, s) => (
                  <svg key={s} className="w-3.5 h-3.5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              {/* Badge */}
              {t.badge && (
                <span className="self-start text-[11px] font-medium text-ink-muted border border-white/[0.10] rounded-full px-2.5 py-1">
                  {t.badge}
                </span>
              )}

              {/* Quote */}
              <p className="text-[13px] text-ink-subtle leading-relaxed flex-1">
                &ldquo;{t.quote}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center gap-2.5 pt-1">
                <div className="w-8 h-8 rounded-full bg-white/[0.07] border border-white/[0.10] flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0">
                  {t.name[0]}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white leading-tight">{t.name}</p>
                  <p className="text-[11px] text-ink-faint">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
