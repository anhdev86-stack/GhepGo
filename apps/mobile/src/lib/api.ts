const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/api";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

let refreshSession: (() => Promise<string | null>) | null = null;
export function setSessionRefresher(fn: (() => Promise<string | null>) | null) {
  refreshSession = fn;
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string; _retried?: boolean } = {},
): Promise<T> {
  const { token, headers, _retried, ...rest } = options;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (res.status === 401 && token && !_retried && refreshSession && !path.startsWith("/auth/")) {
    const fresh = await refreshSession();
    if (fresh) return request<T>(path, { ...options, token: fresh, _retried: true });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.message ?? "Có lỗi xảy ra", res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (data: { phone: string; password: string }) =>
    request<any>("/auth/login", { method: "POST", body: JSON.stringify(data) }),

  register: (data: { phone: string; password: string; fullName: string; role: string; verificationToken?: string }) =>
    request<any>("/auth/register", { method: "POST", body: JSON.stringify(data) }),

  authConfig: () => request<{ otpRequired: boolean }>("/auth/config"),

  refresh: (refreshToken: string) =>
    request<any>("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }),

  logout: (token: string, refreshToken?: string) =>
    request<any>("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }), token }),

  sendOtp: (phone: string, purpose: "REGISTER" | "RESET_PASSWORD") =>
    request<{ phone: string; resendAfterSecs: number; devCode?: string }>("/auth/otp/send", {
      method: "POST",
      body: JSON.stringify({ phone, purpose }),
    }),

  verifyOtp: (phone: string, code: string, purpose: "REGISTER" | "RESET_PASSWORD") =>
    request<{ phone: string; verificationToken: string }>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code, purpose }),
    }),

  resetPassword: (data: { phone: string; verificationToken: string; newPassword: string }) =>
    request<any>("/auth/password/reset", { method: "POST", body: JSON.stringify(data) }),

  myVehicles: (token: string) => request<any[]>("/vehicles/mine", { token }),

  registerVehicle: (
    token: string,
    data: { plateNumber: string; make: string; model: string },
  ) => request<any>("/vehicles", { method: "POST", body: JSON.stringify(data), token }),

  updateDriverStatus: (token: string, status: "AVAILABLE" | "OFFLINE") =>
    request<any>("/drivers/me/status", { method: "PATCH", body: JSON.stringify({ status }), token }),

  availableTrips: (token: string) => request<any[]>("/trips/available", { token }),

  myDriverTrips: (token: string) => request<any[]>("/trips/driver/mine", { token }),

  tripById: (token: string, tripId: string) => request<any>(`/trips/${tripId}`, { token }),

  acceptTrip: (token: string, tripId: string) =>
    request<any>(`/trips/${tripId}/accept`, { method: "POST", token }),

  updateTripStatus: (token: string, tripId: string, status: string) =>
    request<any>(`/trips/${tripId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
      token,
    }),

  driverMe: (token: string) => request<any>("/drivers/me", { token }),

  /** Demand hotspots in the driver's zone for the current slot, nearest-first. */
  myHotspots: (token: string, limit = 3) =>
    request<{ hotspots: { key: string; lat: number; lng: number; expectedRequests: number; driversNearby: number; undersupplied: boolean; distanceMeters: number | null }[] }>(
      `/drivers/me/hotspots?limit=${limit}`,
      { token },
    ),

  /** Road route through ordered waypoints (carpool stops); `polyline` absent when estimated. */
  routePoints: (token: string, points: { lat: number; lng: number }[]) =>
    request<{ distanceMeters: number; durationSecs: number; estimated: boolean; polyline?: string }>(
      `/geo/route?points=${points.map((p) => `${p.lat},${p.lng}`).join(";")}`,
      { token },
    ),

  availableGroups: (token: string) => request<any[]>("/trip-groups/available", { token }),

  myGroups: (token: string) => request<any[]>("/trip-groups/mine", { token }),

  acceptGroup: (token: string, groupId: string) =>
    request<any>(`/trip-groups/${groupId}/accept`, { method: "POST", token }),

  advanceGroup: (token: string, groupId: string) =>
    request<any>(`/trip-groups/${groupId}/advance`, { method: "PATCH", token }),

  wallet: (token: string) => request<any>("/wallet/me", { token }),
  walletTransactions: (token: string) => request<any[]>("/wallet/me/transactions", { token }),
  myDriverStats: (token: string) => request<any>("/drivers/me/stats", { token }),
  myWithdrawals: (token: string) => request<any[]>("/wallet/withdrawals/mine", { token }),
  requestWithdrawal: (token: string, data: { amount: number; bankName: string; bankAccount: string }) =>
    request<any>("/wallet/withdrawals", { method: "POST", body: JSON.stringify(data), token }),
  confirmCash: (token: string, tripId: string) =>
    request<any>(`/wallet/trips/${tripId}/confirm-cash`, { method: "POST", token }),

  registerDevice: (token: string, data: { kind: "EXPO" | "WEBPUSH"; token: string; platform?: string }) =>
    request<any>("/notifications/devices", { method: "POST", body: JSON.stringify(data), token }),
  notifications: (token: string) => request<any[]>("/notifications", { token }),
  unreadCount: (token: string) => request<{ count: number }>("/notifications/unread-count", { token }),
  markNotificationRead: (token: string, id: string) =>
    request<any>(`/notifications/${id}/read`, { method: "PATCH", token }),
  markAllNotificationsRead: (token: string) => request<any>("/notifications/read-all", { method: "PATCH", token }),

  createComplaint: (token: string, data: { tripId: string; category: string; description: string }) =>
    request<any>("/complaints", { method: "POST", body: JSON.stringify(data), token }),
  myComplaints: (token: string) => request<any[]>("/complaints/mine", { token }),
  complaint: (token: string, id: string) => request<any>(`/complaints/${id}`, { token }),
  complaintMessage: (token: string, id: string, body: string) =>
    request<any>(`/complaints/${id}/messages`, { method: "POST", body: JSON.stringify({ body }), token }),
};
