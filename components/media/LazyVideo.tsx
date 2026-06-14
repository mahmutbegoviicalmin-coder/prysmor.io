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
  const posterSrc = poster ?? videoPoster(src.split("?")[0]);
  const shouldLoad = eager || inView;

  useEffect(() => {
    setReady(false);
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad || !autoPlay) return;

    let cancelled = false;

    const play = () => {
      if (cancelled) return;
      video.play().catch(() => {});
    };

    const markReadyAndPlay = () => {
      if (cancelled) return;
      setReady(true);
      play();
    };

    // canplay = first frame ready (faststart mp4). Avoid canplaythrough — waits for full buffer.
    if (video.readyState >= 3) {
      markReadyAndPlay();
    } else {
      video.addEventListener("canplay", markReadyAndPlay, { once: true });
      video.addEventListener("loadeddata", () => setReady(true), { once: true });
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") play();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      video.removeEventListener("canplay", markReadyAndPlay);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
        fetchPriority={eager ? "high" : "auto"}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
          ready ? "opacity-0" : "opacity-100"
        }`}
      />
      {shouldLoad && (
        <video
          key={src}
          ref={videoRef}
          src={src}
          muted
          loop
          playsInline
          autoPlay={autoPlay}
          preload={eager ? "auto" : "metadata"}
          poster={posterSrc}
          aria-label={label}
          // @ts-expect-error fetchPriority on video is valid in modern browsers
          fetchPriority={eager ? "high" : "auto"}
          className={`${videoClassName} transition-opacity duration-200 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
