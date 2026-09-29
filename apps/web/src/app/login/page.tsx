"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"CUSTOMER" | "DRIVER">("CUSTOMER");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const redirectByRole = (r: string) => {
    if (r === "DRIVER") router.push("/driver");
    else if (r === "ADMIN") router.push("/admin");
    else router.push("/book");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const auth =
        mode === "login"
          ? await api.login({ phone, password })
          : await api.register({ phone, password, fullName, role });
      login(auth);
      redirectByRole(auth.user.role);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-8 bg-white p-6 rounded-lg border">
      <h1 className="text-xl font-semibold mb-4">
        {mode === "login" ? "Đăng nhập" : "Đăng ký"}
      </h1>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          className="border rounded px-3 py-2"
          placeholder="Số điện thoại"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Mật khẩu"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {mode === "register" && (
          <>
            <input
              className="border rounded px-3 py-2"
              placeholder="Họ tên"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <select
              className="border rounded px-3 py-2"
              value={role}
              onChange={(e) => setRole(e.target.value as "CUSTOMER" | "DRIVER")}
            >
              <option value="CUSTOMER">Khách hàng</option>
              <option value="DRIVER">Tài xế</option>
            </select>
          </>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50"
        >
          {loading ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Đăng ký"}
        </button>
      </form>

      <button
        className="text-sm text-blue-600 mt-4"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
      </button>
    </div>
  );
}
