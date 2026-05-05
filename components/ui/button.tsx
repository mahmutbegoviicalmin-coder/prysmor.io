"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[100px] font-sans font-bold text-[14px] tracking-tight transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[#39FF6A] text-black hover:bg-[#5dff83] hover:-translate-y-px active:scale-[0.98]",
        outline:
          "border border-white/[0.20] bg-transparent text-ink hover:border-white/[0.40]",
        ghost:
          "bg-transparent text-ink-muted hover:text-ink hover:bg-white/[0.04]",
        secondary:
          "bg-surface-1 border border-white/[0.08] text-ink hover:border-white/[0.14]",
      },
      size: {
        default: "px-7 py-3",
        sm: "h-8 px-4 text-xs rounded-md",
        lg: "px-8 py-3.5 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };