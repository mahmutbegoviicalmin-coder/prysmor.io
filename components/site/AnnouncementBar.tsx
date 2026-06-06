"use client";

import { useEffect, useState } from "react";

const BAR_H = 36;

export default function AnnouncementBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("prysmor_bar_dismissed")) {
        document.documentElement.style.setProperty("--bar-h", "0px");
        return;
      }
    } catch {
      /* private mode */
    }
    setVisible(true);
    document.documentElement.style.setProperty("--bar-h", `${BAR_H}px`);
  }, []);

  function dismiss() {
    setVisible(false);
    document.documentElement.style.setProperty("--bar-h", "0px");
    try {
      sessionStorage.setItem("prysmor_bar_dismissed", "1");
    } catch {
      /* private mode */
    }
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[1100] flex h-9 items-center justify-center border-b border-[#2ecc5a]/30 bg-[#39FF6A] px-10"
      role="status"
    >
      <p className="truncate text-center text-[12px] font-medium text-black/80">
        Now available for Premiere Pro and After Effects.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[16px] leading-none text-black/45 transition-colors hover:text-black/80"
      >
        ×
      </button>
    </div>
  );
}
