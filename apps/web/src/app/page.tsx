"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="bg-white p-8 rounded-lg border text-center">
      <h1 className="text-2xl font-bold mb-2">GhepGo</h1>
      <p className="text-slate-600 mb-6">Nền tảng đặt xe &amp; ghép xe thông minh</p>

      {!user && (
        <Link href="/login" className="bg-blue-600 text-white rounded px-4 py-2">
          Bắt đầu
        </Link>
      )}
      {user?.role === "CUSTOMER" && (
        <Link href="/book" className="bg-blue-600 text-white rounded px-4 py-2">
          Đặt xe ngay
        </Link>
      )}
      {user?.role === "DRIVER" && (
        <Link href="/driver" className="bg-blue-600 text-white rounded px-4 py-2">
          Vào bảng tài xế
        </Link>
      )}
      {user?.role === "ADMIN" && (
        <Link href="/admin" className="bg-blue-600 text-white rounded px-4 py-2">
          Vào trang quản trị
        </Link>
      )}
    </div>
  );
}
