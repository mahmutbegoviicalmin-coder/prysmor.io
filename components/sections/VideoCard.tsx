"use client";

import { useRef, useEffect, useState } from "react";

interface VideoCardProps {
  src:   string;
  label: string;
}

export default function VideoCard({ src, label }: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const v  = videoRef.current;
    const el = wrapRef.current;
    if (!v || !el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
    >
      <video
        ref={videoRef}
        src={src}
        muted loop playsInline preload="metadata"
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%", objectFit: "cover", display: "block",
          transition: "transform 900ms cubic-bezier(0.22,1,0.36,1)",
          transform: hovered ? "scale(1.025)" : "scale(1)",
        }}
      />

      {/* Subtle vignette, no text overlay */}
      <div aria-hidden style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 50%)",
        pointerEvents: "none",
      }} />

      {/* Label, top left */}
      <div aria-hidden style={{
        position: "absolute", top: "14px", left: "14px",
        background: "rgba(5,5,5,0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "5px", padding: "4px 10px",
        fontSize: "9px", fontWeight: 600,
        letterSpacing: "2px", textTransform: "uppercase",
        color: "rgba(255,255,255,0.3)",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
      }}>
        {label}
      </div>
    </div>
  );
}
