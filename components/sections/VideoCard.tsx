"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface VideoCardProps {
  src: string;
  prompt: string;
  index: number;
  featured?: boolean;
}

export default function VideoCard({ src, prompt, index, featured }: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const wrap  = wrapRef.current;
    if (!video || !wrap) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            if (video.readyState === 0) video.load();
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.2 },
    );

    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      ref={wrapRef}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="relative rounded-[18px] overflow-hidden border border-white/[0.08] bg-[#080a0d] hover:border-white/[0.18] transition-colors duration-200"
      style={{
        width: "100%",
        height: "100%",
        /* isolate this card's paint from the rest of the page */
        contain: "layout style paint",
      }}
    >
      {/* skeleton — static, no animation = zero repaint cost */}
      {!loaded && (
        <div className="absolute inset-0 bg-white/[0.03]" />
      )}

      <video
        ref={videoRef}
        src={src}
        loop
        muted
        playsInline
        preload="none"
        onCanPlay={() => setLoaded(true)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.4s ease",
          /* single compositing layer, no layout recalc */
          transform: "translateZ(0)",
          willChange: "opacity",
        }}
      />

      {/* bottom vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(to top, rgba(4,5,9,0.88) 0%, rgba(4,5,9,0.15) 45%, transparent 70%)",
        }}
      />

      {/* AI Generated badge */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-black/50 backdrop-blur-md border border-white/[0.09]">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        <span className="text-[10px] font-semibold text-white/60 tracking-wide">AI Generated</span>
      </div>

      {/* prompt label */}
      <div className="absolute bottom-0 inset-x-0 px-4 py-3 flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-[8px] bg-accent/[0.14] border border-accent/25 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-3 h-3 text-accent" />
        </div>
        <p className="text-[12.5px] text-white/80 font-mono truncate">
          &ldquo;{prompt}&rdquo;
        </p>
      </div>
    </motion.div>
  );
}
