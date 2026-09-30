"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { useRealtime, useSocketEvent, WS } from "@/lib/realtime";
import { useWebPush } from "@/lib/push";
import { Icon } from "@/components/ui";

interface Notif {
  id: string;
  title: string;
  body: string;
  data?: { screen?: string; tripId?: string };
  readAt: string | null;
  createdAt: string;
}

const linkFor = (n: Notif, role: string) => {
  const s = n.data?.screen;
  if (s === "wallet") return "/wallet";
  if (s === "complaints") return role === "ADMIN" ? "/admin/complaints" : `/complaints${(n.data as any)?.complaintId ? `?id=${(n.data as any).complaintId}` : ""}`;
  if (role === "DRIVER") return "/driver";
  if (role === "ADMIN") return "/admin";
  return "/trips";
};

const timeAgo = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
};

export function NotificationBell({ dark = false }: { dark?: boolean }) {
  const { token, user } = useAuth();
  const { socket } = useRealtime(token);
  const { state: pushState, enable } = useWebPush(token);
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.notifications(token).then(setItems).catch(() => {});
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useSocketEvent<Notif>(socket, WS.NOTIFICATION, (n) => setItems((prev) => [{ ...n, readAt: null }, ...prev].slice(0, 50)));

  if (!user) return null;
  const unread = items.filter((n) => !n.readAt).length;

  const markAll = async () => {
    if (!token) return;
    await api.markAllNotificationsRead(token).catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  };

  return (
    <div className="relative" ref={wrap}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative btn btn-sm ${dark ? "text-white hover:bg-white/10" : "btn-ghost"}`}
        aria-label="Thông báo"
      >
        <Icon.bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] flex items-center justify-center ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] card p-0 shadow-[var(--shadow-float)] z-50 text-sm overflow-hidden fade-up">
          <div className="flex justify-between items-center px-4 py-3 border-b border-ink-100">
            <span className="font-semibold text-ink-900">Thông báo</span>
            {unread > 0 && (
              <button onClick={markAll} className="link text-xs">
                Đánh dấu đã đọc
              </button>
            )}
          </div>
          {pushState === "prompt" && (
            <button onClick={enable} className="w-full text-left px-4 py-2.5 bg-brand-50 text-brand-800 text-xs font-medium border-b border-brand-100 hover:bg-brand-100">
              Bật thông báo đẩy trên trình duyệt này
            </button>
          )}
          {pushState === "denied" && <p className="px-4 py-2 text-xs text-ink-500 border-b border-ink-100">Trình duyệt đang chặn thông báo.</p>}
          <ul className="max-h-96 overflow-auto divide-y divide-ink-100">
            {items.length === 0 && <li className="px-4 py-8 text-center text-ink-500">Chưa có thông báo.</li>}
            {items.map((n) => (
              <li key={n.id} className={n.readAt ? "" : "bg-brand-50/40"}>
                <Link
                  href={linkFor(n, user.role)}
                  onClick={() => {
                    setOpen(false);
                    if (!n.readAt && token) {
                      api.markNotificationRead(token, n.id).catch(() => {});
                      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
                    }
                  }}
                  className="flex gap-3 px-4 py-3 hover:bg-ink-50"
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand-500"}`} />
                  <span className="min-w-0">
                    <p className="font-medium text-ink-900">{n.title}</p>
                    <p className="text-ink-600 text-xs mt-0.5">{n.body}</p>
                    <p className="text-ink-400 text-[11px] mt-1">{timeAgo(n.createdAt)}</p>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
