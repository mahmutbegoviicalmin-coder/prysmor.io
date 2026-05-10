"use client";

import { useState, useEffect } from "react";
import { X, Tag } from "lucide-react";

const BAR_H = 36; // px

const MESSAGES = [
  { icon: "✦", text: "Limited time — 20% off your first plan with code" , code: "WELCOME20" },
  { icon: "✦", text: "Generate cinematic VFX directly in Premiere Pro"  , code: null       },
  { icon: "✦", text: "20% off · Use code at checkout"                   , code: "WELCOME20" },
  { icon: "✦", text: "Prompt in. Cinematic shot out. Try Prysmor today"  , code: null       },
];

export default function AnnouncementBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("prysmor_bar_dismissed")) return;
    setVisible(true);
    document.documentElement.style.setProperty("--bar-h", `${BAR_H}px`);
  }, []);

  function dismiss() {
    setVisible(false);
    document.documentElement.style.setProperty("--bar-h", "0px");
    sessionStorage.setItem("prysmor_bar_dismissed", "1");
  }

  if (!visible) return null;

  // Duplicate messages for seamless loop
  const items = [...MESSAGES, ...MESSAGES];

  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0,
      height: `${BAR_H}px`,
      background: "#39FF6A",
      zIndex: 1100,
      display: "flex",
      alignItems: "center",
      overflow: "hidden",
    }}>
      {/* Scrolling track */}
      <div className="ann-track" style={{
        display: "flex",
        alignItems: "center",
        gap: "0",
        whiteSpace: "nowrap",
        animation: "annScroll 28s linear infinite",
        willChange: "transform",
      }}>
        {items.map((msg, i) => (
          <span
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              padding: "0 40px",
              fontSize: "12px",
              fontWeight: 600,
              color: "rgba(0,0,0,0.8)",
              letterSpacing: "-0.1px",
            }}
          >
            <span style={{ fontSize: "8px", color: "rgba(0,0,0,0.4)" }}>{msg.icon}</span>
            {msg.text}
            {msg.code && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                background: "rgba(0,0,0,0.12)",
                borderRadius: "4px",
                padding: "2px 8px",
                fontSize: "11px",
                fontWeight: 800,
                color: "#000",
                letterSpacing: "1.5px",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
              }}>
                <Tag size={9} strokeWidth={2.5} />
                {msg.code}
              </span>
            )}
          </span>
        ))}
      </div>

      {/* Dismiss */}
      <button
        onClick={dismiss}
        aria-label="Close"
        style={{
          position: "absolute",
          right: "12px",
          top: "50%",
          transform: "translateY(-50%)",
          background: "rgba(0,0,0,0.12)",
          border: "none",
          borderRadius: "50%",
          width: "22px",
          height: "22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "rgba(0,0,0,0.5)",
          flexShrink: 0,
          transition: "background 150ms",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.22)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.12)"; }}
      >
        <X size={11} strokeWidth={2.5} />
      </button>

      <style>{`
        @keyframes annScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .ann-track { animation: annScroll 28s linear infinite; }
        .ann-track:hover { animation-play-state: paused; }
      `}</style>
    </div>
  );
}
