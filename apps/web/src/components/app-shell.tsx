"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NavBar } from "@/components/nav-bar";
import { Logo } from "@/components/ui";

/** Full-bleed pages (landing, auth) draw their own chrome; everything else gets the app container. */
const FULL_BLEED = ["/", "/login"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullBleed = FULL_BLEED.includes(pathname);

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar transparent={pathname === "/"} />
      {fullBleed ? (
        <main className="flex-1">{children}</main>
      ) : (
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up">{children}</main>
      )}
      <footer className="border-t border-ink-200/60 bg-white/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-500">
          <Logo size={22} />
          <p>© {new Date().getFullYear()} GhepGo · Nền tảng đặt xe & ghép xe thông minh</p>
          <p className="flex gap-4">
            <span>Hỗ trợ 24/7</span>
            <span>Điều khoản</span>
            <span>Bảo mật</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
