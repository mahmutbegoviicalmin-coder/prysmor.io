"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInView, videoPoster } from "@/hooks/useInView";

type CapabilityVideoPlayerProps = {
  videos: string[];
  activeIndex: number;
  label: string;
  eager?: boolean;
  warmIndex?: number | null;
  className?: string;
};

export default function CapabilityVideoPlayer({
  videos,
  activeIndex,
  label,
  eager = false,
  warmIndex = null,
  className = "",
}: CapabilityVideoPlayerProps) {
  const { ref, inView } = useInView<HTMLDivElement>({
    rootMargin: "480px",
    once: true,
  });
  const shouldLoad = eager || inView;
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [ready, setReady] = useState<boolean[]>(() => videos.map(() => false));

  const markReady = useCallback((index: number) => {
    setReady((prev) => {
      if (prev[index]) return prev;
      const next = [...prev];
      next[index] = true;
      return next;
    });
  }, []);

  useEffect(() => {
    setReady(videos.map(() => false));
    videoRefs.current = [];
  }, [videos]);

  useEffect(() => {
    if (!shouldLoad) return;

    videoRefs.current.forEach((video, index) => {
      if (!video) return;

      if (index === activeIndex) {
        if (video.readyState >= 2) markReady(index);
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [activeIndex, shouldLoad, markReady]);

  useEffect(() => {
    if (warmIndex == null || !shouldLoad) return;
    const video = videoRefs.current[warmIndex];
    if (video && video.readyState === 0) video.load();
  }, [warmIndex, shouldLoad]);

  const safeIndex = Math.min(Math.max(activeIndex, 0), videos.length - 1);
  const fallbackPoster = videoPoster(videos[safeIndex] ?? videos[0]);

  return (
    <div
      ref={ref}
      className={`relative aspect-video overflow-hidden bg-[#0a0a0a] ${className}`}
    >
      {!shouldLoad && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fallbackPoster}
          alt=""
          aria-hidden
          decoding="async"
          fetchPriority={eager ? "high" : "auto"}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {shouldLoad &&
        videos.map((src, index) => {
          const poster = videoPoster(src);
          const isActive = index === safeIndex;
          const isReady = ready[index];

          return (
            <div
              key={src}
              className={`absolute inset-0 transition-opacity duration-150 ${
                isActive ? "z-10 opacity-100" : "z-0 opacity-0"
              }`}
              aria-hidden={!isActive}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={poster}
                alt=""
                aria-hidden
                decoding="async"
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${
                  isReady && isActive ? "opacity-0" : "opacity-100"
                }`}
              />
              <video
                ref={(el) => {
                  videoRefs.current[index] = el;
                }}
                src={src}
                muted
                loop
                playsInline
                preload={shouldLoad ? "auto" : "none"}
                poster={poster}
                aria-label={isActive ? label : undefined}
                tabIndex={isActive ? 0 : -1}
                onCanPlay={() => markReady(index)}
                onLoadedData={() => markReady(index)}
                className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${
                  isReady ? "opacity-100" : "opacity-0"
                }`}
              />
            </div>
          );
        })}
    </div>
  );
}
