"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { NotificationBell } from "@/components/notification-bell";
import { Avatar, Icon, Logo } from "@/components/ui";

const LINKS: Record<string, { href: string; label: string }[]> = {
  CUSTOMER: [
    { href: "/book", label: "Đặt xe" },
    { href: "/trips", label: "Chuyến của tôi" },
    { href: "/wallet", label: "Ví" },
    { href: "/complaints", label: "Hỗ trợ" },
  ],
  DRIVER: [
    { href: "/driver", label: "Bảng tài xế" },
    { href: "/wallet", label: "Thu nhập" },
    { href: "/complaints", label: "Hỗ trợ" },
  ],
  ADMIN: [
    { href: "/admin", label: "Đội xe" },
    { href: "/admin/forecast", label: "Dự báo" },
    { href: "/admin/pricing", label: "Giá & KM" },
    { href: "/admin/reports", label: "Báo cáo" },
    { href: "/admin/complaints", label: "Khiếu nại" },
  ],
};

const ROLE_LABEL: Record<string, string> = { CUSTOMER: "Khách hàng", DRIVER: "Tài xế", ADMIN: "Quản trị" };

export function NavBar({ transparent = false }: { transparent?: boolean }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = user ? LINKS[user.role] ?? [] : [];
  const onDark = transparent && !scrolled && !open;

  const signOut = () => {
    logout();
    router.push("/login");
  };

  return (
    <header
      className={`sticky top-0 z-40 transition-colors ${
        onDark ? "bg-transparent" : "bg-white/85 backdrop-blur-md border-b border-ink-200/60"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="shrink-0" aria-label="GhepGo">
          <Logo dark={onDark} />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => {
            const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href + "/"));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  active
                    ? onDark
                      ? "bg-white/15 text-white"
                      : "bg-brand-50 text-brand-800"
                    : onDark
                      ? "text-white/80 hover:text-white hover:bg-white/10"
                      : "text-ink-600 hover:text-ink-900 hover:bg-ink-100"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <NotificationBell dark={onDark} />
              <div className="hidden md:flex items-center gap-2 pl-2 ml-1 border-l border-ink-200/60">
                <Avatar name={user.fullName} size={32} />
                <div className="leading-tight">
                  <p className={`text-sm font-semibold ${onDark ? "text-white" : "text-ink-900"}`}>{user.fullName}</p>
                  <p className={`text-[11px] ${onDark ? "text-white/70" : "text-ink-500"}`}>{ROLE_LABEL[user.role]}</p>
                </div>
                <button onClick={signOut} className={`btn btn-sm ${onDark ? "text-white/80 hover:bg-white/10" : "btn-ghost"}`} title="Đăng xuất">
                  <Icon.logout className="h-4 w-4" />
                </button>
              </div>
              <button className={`md:hidden btn btn-sm ${onDark ? "text-white" : "btn-ghost"}`} onClick={() => setOpen((o) => !o)} aria-label="Menu">
                {open ? <Icon.x className="h-5 w-5" /> : <Icon.menu className="h-5 w-5" />}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className={`btn btn-sm ${onDark ? "text-white hover:bg-white/10" : "btn-ghost"}`}>
                Đăng nhập
              </Link>
              <Link href="/login?mode=register" className={`btn btn-sm ${onDark ? "bg-white text-ink-900 hover:bg-brand-50" : "btn-primary"}`}>
                Bắt đầu
              </Link>
            </>
          )}
        </div>
      </div>

      {open && user && (
        <div className="md:hidden border-t border-ink-200/60 bg-white px-4 py-3 flex flex-col gap-1">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar name={user.fullName} size={36} />
            <div>
              <p className="text-sm font-semibold text-ink-900">{user.fullName}</p>
              <p className="text-xs text-ink-500">{ROLE_LABEL[user.role]} · {user.phone}</p>
            </div>
          </div>
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={`px-3 py-2.5 rounded-lg text-sm font-medium ${pathname === l.href ? "bg-brand-50 text-brand-800" : "text-ink-700 hover:bg-ink-100"}`}>
              {l.label}
            </Link>
          ))}
          <button onClick={signOut} className="px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 text-left hover:bg-red-50">
            Đăng xuất
          </button>
        </div>
      )}
    </header>
  );
}
