"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { treasurySubItems } from "@/config/navigation";
import { cn } from "@/lib/utils";

export function TreasuryNavigationTabs() {
  const pathname = usePathname();

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-1.5 shadow-xs overflow-x-auto no-scrollbar">
      <nav className="flex items-center gap-1 min-w-max">
        {treasurySubItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 shrink-0",
                isActive
                  ? "bg-amber-500 text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              {Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-slate-900" : "text-slate-500")} />}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
