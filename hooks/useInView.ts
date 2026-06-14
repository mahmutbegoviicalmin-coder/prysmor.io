"use client";

import { useEffect, useRef, useState } from "react";

type UseInViewOptions = {
  rootMargin?: string;
  threshold?: number;
  once?: boolean;
};

export function useInView<T extends Element>({
  rootMargin = "320px",
  threshold = 0,
  once = true,
}: UseInViewOptions = {}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, threshold, once]);

  return { ref, inView };
}

const PRIMJERI_ASSET_VERSION = "?v=2";

export function videoPoster(src: string) {
  const base = src.split("?")[0].replace(/\.mp4$/i, "-poster.jpg");
  return `${base}${PRIMJERI_ASSET_VERSION}`;
}

export function withAssetVersion(src: string) {
  if (src.includes("?")) return src;
  return `${src}${PRIMJERI_ASSET_VERSION}`;
}
