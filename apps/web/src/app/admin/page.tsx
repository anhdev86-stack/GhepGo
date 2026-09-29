"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";

export default function AdminPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [trips, setTrips] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    api.allDrivers(token).then(setDrivers).catch(() => {});
    api.allVehicles(token).then(setVehicles).catch(() => {});
    api.allTrips(token).then(setTrips).catch(() => {});
  }, [token]);

  if (!isLoading && (!user || user.role !== "ADMIN")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Quản trị đội xe</h1>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-2">Tài xế ({drivers.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th>Tên</th>
              <th>SĐT</th>
              <th>Trạng thái</th>
              <th>Số xe</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className="border-t">
                <td>{d.user?.fullName}</td>
                <td>{d.user?.phone}</td>
                <td>{d.status}</td>
                <td>{d.vehicles?.length ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-2">Xe ({vehicles.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th>Biển số</th>
              <th>Xe</th>
              <th>Tài xế</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id} className="border-t">
                <td>{v.plateNumber}</td>
                <td>
                  {v.make} {v.model}
                </td>
                <td>{v.driver?.user?.fullName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-2">Chuyến đi ({trips.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th>Khách</th>
              <th>Tài xế</th>
              <th>Trạng thái</th>
              <th>Giá</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t.id} className="border-t">
                <td>{t.customer?.fullName}</td>
                <td>{t.driver?.user?.fullName ?? "-"}</td>
                <td>{t.status}</td>
                <td>{Number(t.fare).toLocaleString("vi-VN")} đ</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
