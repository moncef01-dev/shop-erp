"use client";

import React, { useState, useEffect } from "react";
import { X, AlertCircle, Loader2 } from "lucide-react";
import { createCustomerAction } from "@/app/customers/actions";

export interface CreatedCustomerData {
  id: number;
  code: string | null;
  name: string;
  phone: string | null;
  phone2?: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

interface NewCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (customer: CreatedCustomerData) => void;
  title?: string;
  subtitle?: string;
}

export function NewCustomerModal({
  isOpen,
  onClose,
  onSuccess,
  title = "Ajouter un Nouveau Client",
  subtitle,
}: NewCustomerModalProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPending, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isPending) return;

    setError(null);
    const formElement = e.currentTarget;
    const formData = new FormData(formElement);
    const name = (formData.get("name") as string)?.trim();

    if (!name || name.length < 2) {
      setError("Le nom du client est obligatoire (au moins 2 caractères).");
      return;
    }

    try {
      setIsPending(true);
      const res = await createCustomerAction(formData);

      if (res.success && res.data) {
        onSuccess(res.data as CreatedCustomerData);
        onClose();
      } else {
        setError(res.error || "Erreur lors de la création de la fiche client.");
      }
    } catch (err: unknown) {
      console.error("Erreur soumission client:", err);
      setError("Une erreur inattendue est survenue. Veuillez vérifier votre saisie et réessayer.");
    } finally {
      setIsPending(false);
    }
  };

  const handleClose = () => {
    if (isPending) return;
    setError(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) {
          handleClose();
        }
      }}
    >
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6 text-slate-900 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            title="Fermer (Échap)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Nom et Prénom / Entreprise <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              disabled={isPending}
              placeholder="Ex : M. Benali Karim"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-400"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Téléphone Principal
              </label>
              <input
                type="tel"
                name="phone"
                disabled={isPending}
                placeholder="Ex : 0550 12 34 56"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Téléphone Secondaire (Optionnel)
              </label>
              <input
                type="tel"
                name="phone2"
                disabled={isPending}
                placeholder="Ex : 0661 98 76 54"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Adresse Email (Optionnelle)
            </label>
            <input
              type="email"
              name="email"
              disabled={isPending}
              placeholder="client@mail.com"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Adresse & Ville de Livraison
            </label>
            <input
              type="text"
              name="address"
              disabled={isPending}
              placeholder="Ex : Cité 500 Logements, Bab Ezzouar, Alger"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Notes / Observations Particulières
            </label>
            <textarea
              name="notes"
              rows={2}
              disabled={isPending}
              placeholder="Préférences de livraison, instructions spécifiques..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-400"
            ></textarea>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-slate-900" />
                  Enregistrement...
                </>
              ) : (
                "Enregistrer le Client"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
