"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";

export function NavBar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="border-b bg-white">
      <div className="max-w-3xl mx-auto p-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg">
          GhepGo
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {!user && (
            <Link href="/login" className="text-blue-600">
              Đăng nhập
            </Link>
          )}
          {user?.role === "CUSTOMER" && (
            <>
              <Link href="/book">Đặt xe</Link>
              <Link href="/trips">Chuyến của tôi</Link>
            </>
          )}
          {user?.role === "DRIVER" && <Link href="/driver">Bảng tài xế</Link>}
          {user?.role === "ADMIN" && <Link href="/admin">Quản trị</Link>}
          {user && (
            <>
              <span className="text-slate-500">{user.fullName}</span>
              <button
                onClick={() => {
                  logout();
                  router.push("/login");
                }}
                className="text-red-600"
              >
                Đăng xuất
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
