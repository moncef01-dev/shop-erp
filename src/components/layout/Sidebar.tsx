"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { Sofa, ChevronDown } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    "/cash": true,
  });

  // Automatically keep section open if user is currently navigating inside it
  useEffect(() => {
    navItems.forEach((item) => {
      if (item.subItems && pathname.startsWith(item.href)) {
        setOpenSections((prev) => ({ ...prev, [item.href]: true }));
      }
    });
  }, [pathname]);

  const toggleSection = (href: string) => {
    setOpenSections((prev) => ({ ...prev, [href]: !prev[href] }));
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800 bg-slate-900">
      {/* Logo / Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 shadow-sm shadow-amber-500/20">
          <Sofa className="h-4 w-4 text-slate-900" />
        </div>
        <div>
          <p className="text-base font-bold text-white leading-none">
            Shop ERP
          </p>
          <p className="text-xs text-slate-400 mt-1">Gestion de Mobilier</p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const isSectionActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const isOpen = Boolean(openSections[item.href]);
            const Icon = item.icon;

            if (hasSubItems) {
              return (
                <li key={item.href} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleSection(item.href)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150",
                      isSectionActive
                        ? "bg-slate-800/80 text-amber-400"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={cn(
                          "h-4.5 w-4.5 shrink-0 transition-colors",
                          isSectionActive ? "text-amber-400" : "text-slate-400"
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
                        isOpen && "rotate-180 text-amber-400"
                      )}
                    />
                  </button>

                  {/* Collapsible Sub-menu */}
                  {isOpen && item.subItems && (
                    <ul className="pl-4 pr-1 py-1 space-y-0.5 border-l border-slate-800 ml-4">
                      {item.subItems.map((sub) => {
                        const isSubActive = pathname === sub.href;
                        const SubIcon = sub.icon;

                        return (
                          <li key={sub.href}>
                            <Link
                              href={sub.href}
                              className={cn(
                                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150",
                                isSubActive
                                  ? "bg-amber-500/20 text-amber-300 font-semibold shadow-xs"
                                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                              )}
                            >
                              {SubIcon ? (
                                <SubIcon
                                  className={cn(
                                    "h-3.5 w-3.5 shrink-0",
                                    isSubActive ? "text-amber-400" : "text-slate-400"
                                  )}
                                />
                              ) : (
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full shrink-0",
                                    isSubActive ? "bg-amber-400" : "bg-slate-600"
                                  )}
                                />
                              )}
                              <span className="truncate">{sub.label}</span>
                              {isSubActive && (
                                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            }

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150",
                    isSectionActive
                      ? "bg-amber-500/15 text-amber-400"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4.5 w-4.5 shrink-0 transition-colors",
                      isSectionActive ? "text-amber-400" : "text-slate-400"
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                  {isSectionActive && (
                    <span className="ml-auto h-2 w-2 rounded-full bg-amber-400" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-800 px-4 py-3">
        <p className="text-xs text-slate-500">
          v0.1.0 — Données locales sécurisées
        </p>
      </div>
    </aside>
  );
}
