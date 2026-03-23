import { cn } from "@/lib/classNames";

interface SectionProps {
  id?: string;
  className?: string;
  children: React.ReactNode;
  haze?: boolean;
  hazeColor?: "lime" | "mint" | "neutral";
  as?: React.ElementType;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

const hazeGradients: Record<string, string> = {
  lime: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(182,255,46,0.06) 0%, transparent 70%)",
  mint: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(34,255,176,0.05) 0%, transparent 70%)",
  neutral: "radial-gradient(ellipse 60% 30% at 50% 0%, rgba(255,255,255,0.025) 0%, transparent 70%)",
};

export default function Section({
  id,
  className,
  children,
  haze = false,
  hazeColor = "neutral",
  as: Tag = "section",
  ariaLabel,
  ariaLabelledBy,
}: SectionProps) {
  return (
    <Tag
      id={id}
      className={cn("relative py-28", className)}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      {haze && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64"
          style={{ background: hazeGradients[hazeColor] }}
          aria-hidden="true"
        />
      )}
      {children}
    </Tag>
  );
}
