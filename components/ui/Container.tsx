"use client";

import { cn } from "@/lib/classNames";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}

export default function Container({
  children,
  className,
  as: Tag = "div",
}: ContainerProps) {
  return (
    <Tag className={cn("mx-auto w-full max-w-container px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </Tag>
  );
}
