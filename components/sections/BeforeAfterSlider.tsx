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
  const containerRef = useRef<HTMLDivElement>(null);
  const beforeRef    = useRef<HTMLVideoElement>(null);
  const afterRef     = useRef<HTMLVideoElement>(null);
  const animRef      = useRef<number>(0);

  const [pos, setPos]           = useState(initialPos);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered]   = useState(false);
  const [ready, setReady]       = useState(false);
  const [userTouched, setUserTouched] = useState(false);
  const readyCount   = useRef(0);
  const targetPos    = useRef(initialPos);
  const currentPos   = useRef(initialPos);
  const lerpSpeed    = useRef(0.12);

  // Autoplay both via IntersectionObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        [beforeRef.current, afterRef.current].forEach(v => {
          if (!v) return;
          if (entry.isIntersecting) {
            v.play().catch(() => {});
          } else {
            v.pause();
          }
        });
      },
      { threshold: 0.1 },
    );
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

  // Smooth lerp animation loop
  useEffect(() => {
    function tick() {
      const diff = targetPos.current - currentPos.current;
      if (Math.abs(diff) > 0.02) {
        currentPos.current += diff * lerpSpeed.current;
        setPos(currentPos.current);
      }
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // Auto-reveal sequence: start at 85% → slide to 18% → settle at 50%
  useEffect(() => {
    if (userTouched) return;

    // Set initial position far-right (mostly before)
    targetPos.current  = 85;
    currentPos.current = 85;
    lerpSpeed.current  = 0.12;

    // After 2.5s: slow cinematic slide to ~18% (mostly after)
    const t1 = setTimeout(() => {
      lerpSpeed.current = 0.022; // slow, cinematic
      targetPos.current = 18;
    }, 2500);

    // After ~6s: settle back to center
    const t2 = setTimeout(() => {
      lerpSpeed.current = 0.045;
      targetPos.current = 50;
    }, 6200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTouched]);

  const updateTarget = useCallback((clientX: number) => {
    lerpSpeed.current = 0.18; // fast when user controls
    targetPos.current = getPercent(clientX);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mouse
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    setUserTouched(true);
    updateTarget(e.clientX);
  }, [updateTarget]);

  useEffect(() => {
    function onMove(e: MouseEvent)  { if (dragging) updateTarget(e.clientX); }
    function onUp()                  { setDragging(false); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, updateTarget]);

  // Touch
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    setDragging(true);
    setUserTouched(true);
    updateTarget(e.touches[0].clientX);
  }, [updateTarget]);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    updateTarget(e.touches[0].clientX);
  }, [updateTarget]);
  const onTouchEnd = useCallback(() => setDragging(false), []);

  // Click anywhere to jump
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
        position:    "relative",
        width:       "100%",
        aspectRatio: "16 / 9",
        borderRadius: "18px",
        overflow:    "hidden",
        background:  "#080808",
        cursor:      dragging ? "ew-resize" : "col-resize",
        userSelect:  "none",
        WebkitUserSelect: "none",
        touchAction: "none",
        boxShadow:   isActive
          ? "0 0 0 1px rgba(57,255,106,0.25), 0 32px 80px rgba(0,0,0,0.7)"
          : "0 0 0 1px rgba(255,255,255,0.07), 0 24px 60px rgba(0,0,0,0.6)",
        transition:  "box-shadow 300ms ease",
      }}
    >
      {/* Spinner overlay while loading */}
      {!ready && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          background: "#080808",
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

      {/* BEFORE — full frame (sits below) */}
      <video
        ref={beforeRef}
        src={beforeSrc}
        muted loop playsInline preload="auto"
        onCanPlay={onVideoReady}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover", display: "block",
        }}
      />

      {/* AFTER — clipped to left of divider */}
      <div style={{
        position: "absolute", inset: 0,
        clipPath: `inset(0 ${100 - pos}% 0 0)`,
      }}>
        <video
          ref={afterRef}
          src={afterSrc}
          muted loop playsInline preload="auto"
          onCanPlay={onVideoReady}
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "cover", display: "block",
          }}
        />
        {/* Green tint overlay on AFTER side — very subtle */}
        <div aria-hidden style={{
          position: "absolute", inset: 0,
          background: "rgba(57,255,106,0.03)",
          pointerEvents: "none",
        }} />
      </div>

      {/* ── Divider ── */}

      {/* Glow line */}
      <div style={{
        position:  "absolute",
        top: 0, bottom: 0,
        left:      `${pos}%`,
        width:     isActive ? "2px" : "1.5px",
        transform: "translateX(-50%)",
        background: isActive
          ? "linear-gradient(to bottom, transparent 0%, white 20%, white 80%, transparent 100%)"
          : "linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.7) 20%, rgba(255,255,255,0.7) 80%, transparent 100%)",
        boxShadow:  isActive ? "0 0 16px rgba(255,255,255,0.4)" : "0 0 8px rgba(255,255,255,0.15)",
        zIndex:     4,
        pointerEvents: "none",
        transition: "width 200ms ease, box-shadow 200ms ease",
      }} />

      {/* Handle */}
      <div style={{
        position:  "absolute",
        top:       "50%",
        left:      `${pos}%`,
        transform: `translate(-50%, -50%) scale(${isActive ? 1.08 : 1})`,
        width:     "44px",
        height:    "44px",
        borderRadius: "50%",
        background: "rgba(255,255,255,0.97)",
        boxShadow:  isActive
          ? "0 0 0 4px rgba(57,255,106,0.25), 0 6px 24px rgba(0,0,0,0.6)"
          : "0 0 0 2px rgba(255,255,255,0.15), 0 4px 16px rgba(0,0,0,0.5)",
        zIndex:     5,
        display:    "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor:     "ew-resize",
        transition: "transform 200ms cubic-bezier(0.22,1,0.36,1), box-shadow 200ms ease",
      }}>
        <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
          <path d="M6 5H14M6 5L3 2M6 5L3 8M14 5L17 2M14 5L17 8"
            stroke="rgba(0,0,0,0.65)" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* ── Labels ── */}

      {/* BEFORE — bottom-left of divider */}
      <div style={{
        position: "absolute", bottom: "18px",
        left: `${Math.min(pos - 2, 60)}%`,
        transform: "translateX(-100%)",
        zIndex: 6, pointerEvents: "none",
        opacity: pos > 18 ? 1 : 0,
        transition: "opacity 200ms ease",
        paddingRight: "12px",
      }}>
        <span style={{
          display: "inline-block",
          fontSize: "9px", fontWeight: 700, letterSpacing: "2px",
          color: "rgba(255,255,255,0.45)",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          textTransform: "uppercase",
        }}>
          {beforeLabel}
        </span>
      </div>

      {/* AFTER — bottom-right of divider */}
      <div style={{
        position: "absolute", bottom: "18px",
        left: `${Math.max(pos + 2, 40)}%`,
        zIndex: 6, pointerEvents: "none",
        opacity: pos < 82 ? 1 : 0,
        transition: "opacity 200ms ease",
        paddingLeft: "12px",
      }}>
        <span style={{
          display: "inline-block",
          fontSize: "9px", fontWeight: 700, letterSpacing: "2px",
          color: "#39FF6A",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          textTransform: "uppercase",
        }}>
          {afterLabel}
        </span>
      </div>

      {/* Bottom gradient */}
      <div aria-hidden style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "70px",
        background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
        pointerEvents: "none", zIndex: 3,
      }} />

      {/* Drag hint — top center, fades on hover */}
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
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          padding: "5px 12px", borderRadius: "20px",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
          <span style={{ fontSize: "11px" }}>↔</span>
          Drag to compare
        </span>
      </div>

      <style>{`
        @keyframes baSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
