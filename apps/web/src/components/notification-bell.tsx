"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { useRealtime, useSocketEvent, WS } from "@/lib/realtime";
import { useWebPush } from "@/lib/push";

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
  if (role === "DRIVER") return "/driver";
  if (role === "ADMIN") return "/admin";
  return "/trips";
};

export function NotificationBell() {
  const { token, user } = useAuth();
  const { socket } = useRealtime(token);
  const { state: pushState, enable } = useWebPush(token);
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    api.notifications(token).then(setItems).catch(() => {});
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent<Notif>(socket, WS.NOTIFICATION, (n) => setItems((prev) => [{ ...n, readAt: null }, ...prev].slice(0, 50)));

  if (!user) return null;
  const unread = items.filter((n) => !n.readAt).length;

  const markAll = async () => {
    if (!token) return;
    await api.markAllNotificationsRead(token).catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative px-1" aria-label="Thông báo">
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] rounded-full px-1.5 min-w-[18px] text-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border rounded-lg shadow-lg z-20 text-sm">
          <div className="flex justify-between items-center px-3 py-2 border-b">
            <span className="font-medium">Thông báo</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-blue-600 underline">Đánh dấu đã đọc</button>
            )}
          </div>
          {pushState === "prompt" && (
            <button onClick={enable} className="w-full text-left px-3 py-2 bg-blue-50 text-blue-700 text-xs border-b">
              Bật thông báo đẩy trên trình duyệt này
            </button>
          )}
          {pushState === "denied" && <p className="px-3 py-2 text-xs text-slate-500 border-b">Trình duyệt đang chặn thông báo.</p>}
          <ul className="max-h-80 overflow-auto divide-y">
            {items.length === 0 && <li className="px-3 py-3 text-slate-500">Chưa có thông báo.</li>}
            {items.map((n) => (
              <li key={n.id} className={n.readAt ? "" : "bg-slate-50"}>
                <Link
                  href={linkFor(n, user.role)}
                  onClick={() => {
                    setOpen(false);
                    if (!n.readAt && token) {
                      api.markNotificationRead(token, n.id).catch(() => {});
                      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
                    }
                  }}
                  className="block px-3 py-2 hover:bg-slate-100"
                >
                  <p className="font-medium">{n.title}</p>
                  <p className="text-slate-600 text-xs">{n.body}</p>
                  <p className="text-slate-400 text-[10px] mt-0.5">{new Date(n.createdAt).toLocaleString("vi-VN")}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
