"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, videoPoster } from "@/hooks/useInView";

type LazyVideoProps = {
  src: string;
  label: string;
  className?: string;
  videoClassName?: string;
  poster?: string;
  eager?: boolean;
  autoPlay?: boolean;
  onClick?: () => void;
};

export default function LazyVideo({
  src,
  label,
  className = "",
  videoClassName = "absolute inset-0 h-full w-full object-contain",
  poster,
  eager = false,
  autoPlay = true,
  onClick,
}: LazyVideoProps) {
  const { ref, inView } = useInView<HTMLDivElement>({
    rootMargin: eager ? "0px" : "360px",
    once: true,
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const posterSrc = poster ?? videoPoster(src);
  const shouldLoad = eager || inView;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad) return;

    if (video.dataset.src !== src) {
      video.dataset.src = src;
      video.src = src;
      setReady(false);
      video.load();
    }

    if (!autoPlay) return;
    video.play().catch(() => {});
  }, [shouldLoad, src, autoPlay]);

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden bg-[#0a0a0a] ${className}`}
      onClick={onClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={posterSrc}
        alt=""
        aria-hidden
        decoding="async"
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          ready ? "opacity-0" : "opacity-100"
        }`}
      />
      {shouldLoad && (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          poster={posterSrc}
          aria-label={label}
          onCanPlay={() => setReady(true)}
          className={`${videoClassName} transition-opacity duration-300 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
