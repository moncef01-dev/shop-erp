"use client";

import { useEffect } from "react";

/**
 * Prevents accidental mouse-wheel changes on numeric inputs across the entire ERP.
 * When a numeric input is focused and the user scrolls the mouse wheel, the input
 * is blurred so its value remains untouched, while allowing the page to scroll normally.
 */
export function PreventWheelOnNumberInputs() {
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl instanceof HTMLInputElement &&
        activeEl.type === "number"
      ) {
        // Blur the focused number input so the wheel scroll moves the page, not the input value
        activeEl.blur();
      }
    };

    // Passive listener on capture phase ensures prompt execution without blocking smooth page scroll
    window.addEventListener("wheel", handleWheel, { passive: true, capture: true });
    return () => {
      window.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, []);

  return null;
}
