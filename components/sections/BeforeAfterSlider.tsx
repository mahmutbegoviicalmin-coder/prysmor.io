"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface BeforeAfterSliderProps {
  beforeSrc:    string;
  afterSrc:     string;
  beforeLabel?: string;
  afterLabel?:  string;
  initialPos?:  number;
}

export default function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "BEFORE",
  afterLabel  = "AFTER",
  initialPos  = 50,
}: BeforeAfterSliderProps) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const beforeRef       = useRef<HTMLVideoElement>(null);
  const afterRef        = useRef<HTMLVideoElement>(null);
  const afterClipRef    = useRef<HTMLDivElement>(null);
  const dividerLineRef  = useRef<HTMLDivElement>(null);
  const handleRef       = useRef<HTMLDivElement>(null);
  const beforeLabelRef  = useRef<HTMLDivElement>(null);
  const afterLabelRef   = useRef<HTMLDivElement>(null);
  const animRef         = useRef<number>(0);

  /* React state — only for things that change infrequently */
  const [dragging, setDragging]         = useState(false);
  const [hovered, setHovered]           = useState(false);
  const [ready, setReady]               = useState(false);
  const [userTouched, setUserTouched]   = useState(false);

  /* Position bookkeeping — refs only, no React state */
  const readyCount  = useRef(0);
  const targetPos   = useRef(initialPos);
  const currentPos  = useRef(initialPos);
  const lerpSpeed   = useRef(0.12);

  /* ── Direct-DOM position applier (zero React re-renders) ── */
  const applyPos = useCallback((p: number) => {
    if (afterClipRef.current)
      afterClipRef.current.style.clipPath = `inset(0 ${(100 - p).toFixed(3)}% 0 0)`;

    if (dividerLineRef.current)
      dividerLineRef.current.style.left = `${p.toFixed(3)}%`;

    if (handleRef.current)
      handleRef.current.style.left = `${p.toFixed(3)}%`;

    if (beforeLabelRef.current) {
      beforeLabelRef.current.style.left    = `${Math.min(p - 2, 60).toFixed(1)}%`;
      beforeLabelRef.current.style.opacity = p > 18 ? "1" : "0";
    }
    if (afterLabelRef.current) {
      afterLabelRef.current.style.left    = `${Math.max(p + 2, 40).toFixed(1)}%`;
      afterLabelRef.current.style.opacity = p < 82 ? "1" : "0";
    }
  }, []);

  /* ── rAF lerp loop — touches DOM directly, never React state ── */
  useEffect(() => {
    function tick() {
      const diff = targetPos.current - currentPos.current;
      if (Math.abs(diff) > 0.015) {
        currentPos.current += diff * lerpSpeed.current;
        applyPos(currentPos.current);
      }
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [applyPos]);

  /* ── Auto-reveal sequence ── */
  useEffect(() => {
    if (userTouched) return;

    targetPos.current  = 85;
    currentPos.current = 85;
    lerpSpeed.current  = 0.12;
    applyPos(85);

    const t1 = setTimeout(() => {
      lerpSpeed.current = 0.022;
      targetPos.current = 18;
    }, 2500);

    const t2 = setTimeout(() => {
      lerpSpeed.current = 0.045;
      targetPos.current = 50;
    }, 6200);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTouched, applyPos]);

  /* ── Autoplay via IntersectionObserver ── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const io = new IntersectionObserver(([entry]) => {
      [beforeRef.current, afterRef.current].forEach(v => {
        if (!v) return;
        if (entry.isIntersecting) v.play().catch(() => {});
        else v.pause();
      });
    }, { threshold: 0.1 });
    io.observe(container);
    return () => io.disconnect();
  }, []);

  function onVideoReady() {
    readyCount.current += 1;
    if (readyCount.current >= 2) setReady(true);
  }

  function getPercent(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return targetPos.current;
    return Math.min(97, Math.max(3, ((clientX - rect.left) / rect.width) * 100));
  }

  const updateTarget = useCallback((clientX: number) => {
    lerpSpeed.current = 0.22;
    targetPos.current = getPercent(clientX);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Mouse ── */
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    setUserTouched(true);
    updateTarget(e.clientX);
  }, [updateTarget]);

  useEffect(() => {
    function onMove(e: MouseEvent) { if (dragging) updateTarget(e.clientX); }
    function onUp()                 { setDragging(false); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, [dragging, updateTarget]);

  /* ── Touch ── */
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    setDragging(true);
    setUserTouched(true);
    updateTarget(e.touches[0].clientX);
  }, [updateTarget]);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    updateTarget(e.touches[0].clientX);
  }, [updateTarget]);
  const onTouchEnd = useCallback(() => setDragging(false), []);

  /* ── Click to jump ── */
  const onClick = useCallback((e: React.MouseEvent) => {
    setUserTouched(true);
    updateTarget(e.clientX);
  }, [updateTarget]);

  const isActive = dragging || hovered;

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        position: "relative", width: "100%", aspectRatio: "16 / 9",
        borderRadius: "18px", overflow: "hidden", background: "#080808",
        cursor: dragging ? "ew-resize" : "col-resize",
        userSelect: "none", WebkitUserSelect: "none", touchAction: "none",
        boxShadow: isActive
          ? "0 0 0 1px rgba(57,255,106,0.25), 0 32px 80px rgba(0,0,0,0.7)"
          : "0 0 0 1px rgba(255,255,255,0.07), 0 24px 60px rgba(0,0,0,0.6)",
        transition: "box-shadow 300ms ease",
      }}
    >
      {/* Spinner overlay while loading */}
      {!ready && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20, background: "#080808",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            width: "28px", height: "28px", borderRadius: "50%",
            border: "2px solid rgba(57,255,106,0.12)",
            borderTopColor: "#39FF6A",
            animation: "baSpin 0.75s linear infinite",
          }} />
        </div>
      )}

      {/* BEFORE — full frame */}
      <video
        ref={beforeRef}
        src={beforeSrc}
        muted loop playsInline
        preload="auto"
        // @ts-expect-error fetchpriority not in React types yet
        fetchpriority="high"
        onCanPlay={onVideoReady}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%", objectFit: "cover", display: "block",
        }}
      />

      {/* AFTER — clipped */}
      <div
        ref={afterClipRef}
        style={{
          position: "absolute", inset: 0,
          clipPath: `inset(0 ${100 - initialPos}% 0 0)`,
          willChange: "clip-path",
        }}
      >
        <video
          ref={afterRef}
          src={afterSrc}
          muted loop playsInline
          preload="auto"
          // @ts-expect-error fetchpriority not in React types yet
          fetchpriority="high"
          onCanPlay={onVideoReady}
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%", objectFit: "cover", display: "block",
          }}
        />
        <div aria-hidden style={{
          position: "absolute", inset: 0,
          background: "rgba(57,255,106,0.025)", pointerEvents: "none",
        }} />
      </div>

      {/* Divider line */}
      <div
        ref={dividerLineRef}
        style={{
          position: "absolute", top: 0, bottom: 0,
          left: `${initialPos}%`,
          width: "1.5px", transform: "translateX(-50%)",
          background: "linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.75) 20%, rgba(255,255,255,0.75) 80%, transparent 100%)",
          boxShadow: "0 0 8px rgba(255,255,255,0.15)",
          zIndex: 4, pointerEvents: "none",
          willChange: "left",
        }}
      />

      {/* Handle */}
      <div
        ref={handleRef}
        style={{
          position: "absolute", top: "50%",
          left: `${initialPos}%`,
          transform: `translate(-50%, -50%) scale(${isActive ? 1.08 : 1})`,
          width: "44px", height: "44px", borderRadius: "50%",
          background: "rgba(255,255,255,0.97)",
          boxShadow: isActive
            ? "0 0 0 4px rgba(57,255,106,0.25), 0 6px 24px rgba(0,0,0,0.6)"
            : "0 0 0 2px rgba(255,255,255,0.15), 0 4px 16px rgba(0,0,0,0.5)",
          zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "ew-resize",
          transition: "transform 200ms cubic-bezier(0.22,1,0.36,1), box-shadow 200ms ease",
          willChange: "left",
        }}
      >
        <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
          <path d="M6 5H14M6 5L3 2M6 5L3 8M14 5L17 2M14 5L17 8"
            stroke="rgba(0,0,0,0.65)" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* BEFORE label */}
      <div
        ref={beforeLabelRef}
        style={{
          position: "absolute", bottom: "18px",
          left: `${Math.min(initialPos - 2, 60)}%`,
          transform: "translateX(-100%)",
          zIndex: 6, pointerEvents: "none",
          opacity: initialPos > 18 ? 1 : 0,
          transition: "opacity 200ms ease",
          paddingRight: "12px",
          willChange: "left",
        }}
      >
        <span style={{
          display: "inline-block",
          fontSize: "9px", fontWeight: 700, letterSpacing: "2px",
          color: "rgba(255,255,255,0.45)",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          textTransform: "uppercase",
        }}>{beforeLabel}</span>
      </div>

      {/* AFTER label */}
      <div
        ref={afterLabelRef}
        style={{
          position: "absolute", bottom: "18px",
          left: `${Math.max(initialPos + 2, 40)}%`,
          zIndex: 6, pointerEvents: "none",
          opacity: initialPos < 82 ? 1 : 0,
          transition: "opacity 200ms ease",
          paddingLeft: "12px",
          willChange: "left",
        }}
      >
        <span style={{
          display: "inline-block",
          fontSize: "9px", fontWeight: 700, letterSpacing: "2px",
          color: "#39FF6A",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          textTransform: "uppercase",
        }}>{afterLabel}</span>
      </div>

      {/* Bottom gradient */}
      <div aria-hidden style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "70px",
        background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
        pointerEvents: "none", zIndex: 3,
      }} />

      {/* Drag hint */}
      <div style={{
        position: "absolute", top: "16px", left: "50%",
        transform: "translateX(-50%)",
        zIndex: 6, pointerEvents: "none",
        opacity: isActive ? 0 : 0.4,
        transition: "opacity 300ms ease",
        whiteSpace: "nowrap",
      }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          fontSize: "9px", fontWeight: 600, letterSpacing: "1.8px",
          color: "white", textTransform: "uppercase",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          padding: "5px 12px", borderRadius: "20px",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
          <span style={{ fontSize: "11px" }}>↔</span>
          Drag to compare
        </span>
      </div>

      <style>{`@keyframes baSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
