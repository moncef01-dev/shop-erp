"use client";

import { usePathname } from "next/navigation";
import { navItems } from "@/config/navigation";
import { Bell } from "lucide-react";

export function TopBar() {
  const pathname = usePathname();

  const currentPage =
    navItems.find((item) =>
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
    ) ?? navItems[0];

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-sm px-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 leading-none">
          {currentPage.label}
        </h1>
        {currentPage.description && (
          <p className="text-sm text-slate-500 mt-1">
            {currentPage.description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          id="notifications-btn"
          aria-label="Notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <Bell className="h-4 w-4" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-sm font-semibold text-slate-900">
          A
        </div>
      </div>
    </header>
  );
}
