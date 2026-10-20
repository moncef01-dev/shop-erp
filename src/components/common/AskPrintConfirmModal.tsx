"use client";

import React, { useEffect, useRef } from "react";
import { Printer, CheckCircle2, X } from "lucide-react";

export interface AskPrintConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  documentTypeLabel?: string;
  documentReference?: string | null;
  onConfirmPrint: () => void;
  onCancel: () => void;
}

export function AskPrintConfirmModal({
  isOpen,
  title = "Document validé avec succès",
  message = "Souhaitez-vous imprimer ce document maintenant ?",
  documentTypeLabel,
  documentReference,
  onConfirmPrint,
  onCancel,
}: AskPrintConfirmModalProps) {
  const printButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus primary action for immediate Enter/Space keyboard accessibility
      const timer = setTimeout(() => {
        printButtonRef.current?.focus();
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ask-print-modal-title"
      aria-describedby="ask-print-modal-desc"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200/80 p-6 overflow-hidden">
        {/* Decorative accent */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-amber-500" />

        {/* Close icon button */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          title="Fermer sans imprimer (Échap)"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header with success badge */}
        <div className="flex items-start gap-3.5 mb-4 pr-6">
          <div className="h-11 w-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0 shadow-xs">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h3 id="ask-print-modal-title" className="text-base font-bold text-slate-900 leading-tight">
              {title}
            </h3>
            <p id="ask-print-modal-desc" className="text-xs text-slate-500 mt-1">
              {message}
            </p>
          </div>
        </div>

        {/* Document reference card */}
        {(documentReference || documentTypeLabel) && (
          <div className="my-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
                <Printer className="w-4 h-4 text-slate-700" />
              </div>
              <div className="min-w-0">
                {documentTypeLabel && (
                  <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide truncate">
                    {documentTypeLabel}
                  </span>
                )}
                {documentReference && (
                  <span className="block text-sm font-mono font-bold text-slate-900 tracking-tight truncate">
                    {documentReference}
                  </span>
                )}
              </div>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
              Prêt à imprimer
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-6 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer"
          >
            Non, continuer
          </button>
          <button
            ref={printButtonRef}
            type="button"
            onClick={onConfirmPrint}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Oui, imprimer
          </button>
        </div>
      </div>
    </div>
  );
}
