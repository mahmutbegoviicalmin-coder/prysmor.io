import { cn } from "@/lib/utils";

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  haze?: "lime" | "mint" | "neutral" | "none";
}

const hazeStyles: Record<string, string> = {
  lime: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(163,255,18,0.07) 0%, transparent 65%)",
  mint: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(34,255,176,0.06) 0%, transparent 65%)",
  neutral: "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255,255,255,0.025) 0%, transparent 65%)",
  none: "none",
};

export default function Section({ children, className, id, haze = "none" }: SectionProps) {
  return (
    <section id={id} className={cn("relative py-24", className)}>
      {haze !== "none" && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{ background: hazeStyles[haze] }}
          aria-hidden="true"
        />
      )}
      {children}
    </section>
  );
}
