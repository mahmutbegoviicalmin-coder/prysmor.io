"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-background shadow-lime-sm hover:shadow-lime-md hover:-translate-y-0.5 active:translate-y-0",
        outline:
          "border border-white/12 bg-transparent text-ink hover:border-white/22 hover:bg-white/[0.04] hover:-translate-y-0.5",
        ghost:
          "bg-transparent text-ink-muted hover:text-ink hover:bg-white/[0.04]",
        secondary:
          "bg-surface-1 border border-white/8 text-ink hover:border-white/14 hover:-translate-y-0.5",
      },
      size: {
        default: "h-10 px-5 py-2.5",
        sm: "h-8 px-4 text-xs rounded-md",
        lg: "h-12 px-8 text-[15px] rounded-[14px]",
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