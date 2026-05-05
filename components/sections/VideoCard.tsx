"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface VideoCardProps {
  src: string;
  prompt: string;
  label: string;
  index: number;
  featured?: boolean;
}

export default function VideoCard({ src, prompt, label, index }: VideoCardProps) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded]   = useState(false);
  const [hovered, setHovered] = useState(false);

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

  /* reveal line position: 45% default → 55% on hover */
  const revealX = hovered ? "55%" : "45%";

  return (
    <motion.div
      ref={wrapRef}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: index * 0.07 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        borderRadius: "20px",
        overflow: "hidden",
        border: hovered
          ? "1px solid rgba(255,255,255,0.14)"
          : "1px solid rgba(255,255,255,0.07)",
        background: "#080808",
        height: "clamp(240px, 30vw, 340px)",
        contain: "layout style paint",
        transition: "border-color 200ms ease",
        cursor: "default",
      }}
    >
      {/* Skeleton */}
      {!loaded && <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.02)" }} />}

      {/* Video */}
      <video
        ref={videoRef}
        src={src}
        loop muted playsInline preload="none"
        onCanPlay={() => setLoaded(true)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.4s ease, transform 0.5s ease",
          transform: hovered ? "scale(1.025)" : "scale(1)",
          transformOrigin: "center center",
          willChange: hovered ? "transform" : "auto",
        }}
      />

      {/* Bottom gradient */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(5,5,8,0.92) 0%, rgba(5,5,8,0.3) 40%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Reveal line */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "15%",
          bottom: "28%",
          left: revealX,
          width: "1px",
          background: "linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.18) 20%, rgba(255,255,255,0.18) 80%, transparent 100%)",
          transition: "left 500ms cubic-bezier(0.22,1,0.36,1)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* INPUT / OUTPUT labels */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "18%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-around",
          pointerEvents: "none",
          zIndex: 3,
          padding: "0 10%",
        }}
      >
        {["INPUT", "OUTPUT"].map((t) => (
          <span
            key={t}
            style={{
              fontSize: "8px",
              fontWeight: 600,
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.18)",
              textTransform: "uppercase",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}
          >
            {t}
          </span>
        ))}
      </div>

      {/* Caption */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "16px 18px",
          zIndex: 4,
        }}
      >
        <span style={{
          display: "block",
          fontSize: "9px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "2px",
          color: "rgba(57,255,106,0.65)",
          marginBottom: "5px",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
        }}>
          {label}
        </span>
        <p style={{
          fontSize: "12px",
          color: "rgba(255,255,255,0.65)",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          margin: 0,
          lineHeight: 1.4,
        }}>
          &ldquo;{prompt}&rdquo;
        </p>
      </div>
    </motion.div>
  );
}
