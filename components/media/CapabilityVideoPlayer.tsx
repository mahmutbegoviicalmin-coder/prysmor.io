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
    rootMargin: "600px",
    once: true,
  });
  const shouldLoad = eager || inView;
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const activeIndexRef = useRef(activeIndex);
  const [ready, setReady] = useState<boolean[]>(() => videos.map(() => false));

  activeIndexRef.current = activeIndex;

  const markReady = useCallback((index: number) => {
    setReady((prev) => {
      if (prev[index]) return prev;
      const next = [...prev];
      next[index] = true;
      return next;
    });
  }, []);

  const playVideo = useCallback((video: HTMLVideoElement | null, index: number) => {
    if (!video) return;

    const start = () => {
      markReady(index);
      video.play().catch(() => {});
    };

    if (video.readyState >= 2) {
      start();
      return;
    }

    const onCanPlay = () => {
      video.removeEventListener("canplay", onCanPlay);
      if (index === activeIndexRef.current) start();
    };

    video.addEventListener("canplay", onCanPlay);
    if (video.readyState === 0) video.load();
  }, [markReady]);

  const syncPlayback = useCallback(() => {
    if (!shouldLoad) return;

    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (index === activeIndexRef.current) {
        playVideo(video, index);
      } else {
        video.pause();
      }
    });
  }, [shouldLoad, playVideo]);

  useEffect(() => {
    setReady(videos.map(() => false));
    videoRefs.current = [];
  }, [videos]);

  useEffect(() => {
    syncPlayback();
    const id = requestAnimationFrame(syncPlayback);
    return () => cancelAnimationFrame(id);
  }, [activeIndex, shouldLoad, syncPlayback]);

  useEffect(() => {
    if (!shouldLoad) return;

    const onVisibility = () => {
      if (document.visibilityState === "visible") syncPlayback();
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [shouldLoad, syncPlayback]);

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
                isActive ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
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
                  if (el && shouldLoad && index === activeIndexRef.current) {
                    playVideo(el, index);
                  }
                }}
                src={src}
                muted
                loop
                playsInline
                autoPlay={isActive}
                preload="auto"
                poster={poster}
                aria-label={isActive ? label : undefined}
                tabIndex={isActive ? 0 : -1}
                onLoadedData={() => markReady(index)}
                onCanPlay={() => {
                  markReady(index);
                  if (index === activeIndexRef.current) {
                    videoRefs.current[index]?.play().catch(() => {});
                  }
                }}
                onPlaying={() => markReady(index)}
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
