"use client";

import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  className?: string;
}

/**
 * Reusable NumberInput component that enforces type="number",
 * applies standard styling, and explicitly prevents mouse-wheel value mutation
 * on focus while letting the window scroll freely.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, onWheel, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="number"
        onWheel={(e) => {
          // Blur input on wheel so mouse-scroll scrolls the page instead of changing the value
          (e.target as HTMLInputElement).blur();
          if (onWheel) onWheel(e);
        }}
        className={cn(
          "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);

NumberInput.displayName = "NumberInput";
