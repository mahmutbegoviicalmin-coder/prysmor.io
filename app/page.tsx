import HomePageClient from "./HomePageClient";
import { HERO_VIDEO_POSTER, HERO_VIDEO_SRC } from "@/lib/heroMedia";

const PRIMJERI_V = "?v=3";

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
      <link
        rel="preload"
        href={`/primjeri/slider1.mp4${PRIMJERI_V}`}
        as="video"
        type="video/mp4"
      />
      <link
        rel="preload"
        href={`/primjeri/slider2.mp4${PRIMJERI_V}`}
        as="video"
        type="video/mp4"
      />
      <HomePageClient />
    </>
  );
}
