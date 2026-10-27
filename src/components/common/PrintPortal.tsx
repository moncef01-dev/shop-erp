"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface PrintPortalProps {
  children: React.ReactNode;
}

/**
 * PrintPortal renders its children directly into #print-root (or document.body)
 * and toggles the `has-active-print-document` class on document.body.
 *
 * In @media print, this allows CSS in print.css to completely hide the
 * main application shell (#app-root) and print ONLY the portal content.
 */
export function PrintPortal({ children }: PrintPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.body.classList.add("has-active-print-document");

    return () => {
      document.body.classList.remove("has-active-print-document");
    };
  }, []);

  if (!mounted) return null;

  const target = document.getElementById("print-root") || document.body;
  return createPortal(children, target);
}
