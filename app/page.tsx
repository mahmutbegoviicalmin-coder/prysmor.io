import HomePageClient from "./HomePageClient";
import { HERO_VIDEO_POSTER, HERO_VIDEO_SRC } from "@/lib/heroMedia";

export default function PrysmorPage() {
  return (
    <>
      <link
        rel="preload"
        href={HERO_VIDEO_POSTER}
        as="image"
        fetchPriority="high"
      />
      <link
        rel="preload"
        href={HERO_VIDEO_SRC}
        as="video"
        type="video/mp4"
        fetchPriority="high"
      />
      <HomePageClient />
    </>
  );
}
