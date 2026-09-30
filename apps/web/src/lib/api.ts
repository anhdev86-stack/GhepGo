const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Session refresh hook: the auth context registers a function that swaps an
 * expired access token for a new one. `request` calls it once on 401 and
 * retries, so pages never have to care about token lifetime.
 */
let refreshSession: (() => Promise<string | null>) | null = null;
export function setSessionRefresher(fn: (() => Promise<string | null>) | null) {
  refreshSession = fn;
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null; _retried?: boolean } = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && options.token && !options._retried && refreshSession && !path.startsWith("/auth/")) {
    const fresh = await refreshSession();
    if (fresh) return request<T>(path, { ...options, token: fresh, _retried: true });
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const message = (data && (data.message?.toString() ?? data.error)) || res.statusText;
    throw new ApiError(Array.isArray(message) ? message.join(", ") : message, res.status);
  }

  return data as T;
}

export type Gateway = "vnpay" | "momo" | "mock";

export interface RouteResult {
  distanceMeters: number;
  durationSecs: number;
  /** True when the map provider was unavailable and the distance is a straight-line estimate. */
  estimated: boolean;
  /** Encoded polyline5 of the road geometry (absent when estimated). */
  polyline?: string;
}
export type OtpPurpose = "REGISTER" | "RESET_PASSWORD";

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn?: string;
  user: { id: string; phone: string; role: "CUSTOMER" | "DRIVER" | "ADMIN"; fullName: string };
}

export const api = {
  register: (body: {
    phone: string;
    password: string;
    fullName: string;
    role: "CUSTOMER" | "DRIVER";
    verificationToken?: string;
  }) => request<AuthResponse>("/auth/register", { method: "POST", body }),

  authConfig: () => request<{ otpRequired: boolean }>("/auth/config"),

  refresh: (refreshToken: string) => request<AuthResponse>("/auth/refresh", { method: "POST", body: { refreshToken } }),

  logout: (token: string, refreshToken?: string, everywhere = false) =>
    request("/auth/logout", { method: "POST", token, body: { refreshToken, everywhere } }),

  sendOtp: (phone: string, purpose: OtpPurpose) =>
    request<{ phone: string; expiresInSecs: number; resendAfterSecs: number; devCode?: string }>("/auth/otp/send", {
      method: "POST",
      body: { phone, purpose },
    }),

  verifyOtp: (phone: string, code: string, purpose: OtpPurpose) =>
    request<{ phone: string; verificationToken: string }>("/auth/otp/verify", {
      method: "POST",
      body: { phone, code, purpose },
    }),

  resetPassword: (body: { phone: string; verificationToken: string; newPassword: string }) =>
    request<AuthResponse>("/auth/password/reset", { method: "POST", body }),

  login: (body: { phone: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body }),

  createTrip: (
    token: string,
    body: {
      pickupAddress: string;
      pickupLat: number;
      pickupLng: number;
      dropoffAddress: string;
      dropoffLat: number;
      dropoffLng: number;
      tripType: "PRIVATE" | "SHARED";
      seatsRequested?: number;
      paymentMethod?: "CASH" | "WALLET";
    },
  ) => request<any>("/trips", { method: "POST", token, body }),

  myTrips: (token: string) => request<any[]>("/trips/mine", { token }),

  availableTrips: (token: string) => request<any[]>("/trips/available", { token }),

  myDriverTrips: (token: string) => request<any[]>("/trips/driver/mine", { token }),

  acceptTrip: (token: string, tripId: string) =>
    request(`/trips/${tripId}/accept`, { method: "POST", token }),

  updateTripStatus: (token: string, tripId: string, status: string) =>
    request(`/trips/${tripId}/status`, { method: "PATCH", token, body: { status } }),

  cancelTrip: (token: string, tripId: string) =>
    request(`/trips/${tripId}/cancel`, { method: "POST", token }),

  tripById: (token: string, tripId: string) => request<any>(`/trips/${tripId}`, { token }),

  nearbyDrivers: (token: string, lat: number, lng: number, radius = 5000) =>
    request<any[]>(`/drivers/nearby?lat=${lat}&lng=${lng}&radius=${radius}`, { token }),

  updateDriverLocation: (token: string, body: { lat: number; lng: number }) =>
    request("/drivers/me/location", { method: "PATCH", token, body }),

  driverMe: (token: string) => request<any>("/drivers/me", { token }),

  // ---- geo ----
  autocomplete: (token: string, q: string, near?: { lat: number; lng: number }) =>
    request<{ label: string; address: string; lat: number; lng: number }[]>(
      `/geo/autocomplete?q=${encodeURIComponent(q)}${near ? `&lat=${near.lat}&lng=${near.lng}` : ""}`,
      { token },
    ),
  route: (token: string, from: { lat: number; lng: number }, to: { lat: number; lng: number }) =>
    request<RouteResult>(`/geo/route?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}`, { token }),
  /** Road route through ordered waypoints (carpool stops). */
  routePoints: (token: string, points: { lat: number; lng: number }[]) =>
    request<RouteResult>(`/geo/route?points=${points.map((p) => `${p.lat},${p.lng}`).join(";")}`, { token }),
  reverseGeocode: (token: string, p: { lat: number; lng: number }) =>
    request<{ place: { label: string; address: string; lat: number; lng: number } | null }>(`/geo/reverse?lat=${p.lat}&lng=${p.lng}`, { token }),
  geoConfig: (token: string) =>
    request<{ provider: string; tiles: { url: string; attribution: string; maxZoom: number } }>("/geo/provider", { token }),
  /** Active service zones with polygons — any signed-in user. */
  publicZones: (token: string) =>
    request<{ id: string; name: string; centerLat: number; centerLng: number; radiusKm: number; polygon: { type: "Polygon"; coordinates: [number, number][][] } | null; areaKm2: number | null }[]>("/zones", { token }),

  // ---- wallet ----
  wallet: (token: string) => request<any>("/wallet/me", { token }),
  walletGateway: (token: string) =>
    request<{ gateway: Gateway; available: Gateway[] }>("/wallet/gateway", { token }),
  walletTransactions: (token: string) => request<any[]>("/wallet/me/transactions", { token }),
  topup: (token: string, amount: number, gateway?: Gateway) =>
    request<{ txId: string; amount: number; paymentUrl: string; gateway: string }>("/wallet/topup", {
      method: "POST",
      token,
      body: { amount, ...(gateway ? { gateway } : {}) },
    }),
  mockSign: (token: string, body: { txId: string; result: "SUCCESS" | "FAILED"; gatewayRef: string }) =>
    request<{ signature: string }>("/wallet/topup/mock-sign", { method: "POST", token, body }),
  topupCallback: (body: { txId: string; result: "SUCCESS" | "FAILED"; gatewayRef: string; signature: string }) =>
    request("/wallet/topup/callback", { method: "POST", body }),
  confirmCash: (token: string, tripId: string) =>
    request(`/wallet/trips/${tripId}/confirm-cash`, { method: "POST", token }),
  requestWithdrawal: (token: string, body: { amount: number; bankName: string; bankAccount: string }) =>
    request("/wallet/withdrawals", { method: "POST", token, body }),
  myWithdrawals: (token: string) => request<any[]>("/wallet/withdrawals/mine", { token }),
  allWithdrawals: (token: string, status?: string) =>
    request<any[]>(`/wallet/withdrawals${status ? `?status=${status}` : ""}`, { token }),
  resolveWithdrawal: (token: string, id: string, body: { status: "APPROVED" | "REJECTED" | "PAID"; note?: string }) =>
    request(`/wallet/withdrawals/${id}`, { method: "PATCH", token, body }),

  // ---- notifications ----
  vapidPublicKey: (token: string) => request<{ publicKey: string | null }>("/notifications/vapid-public-key", { token }),
  registerDevice: (
    token: string,
    body: { kind: "EXPO" | "WEBPUSH"; token: string; subscription?: Record<string, unknown>; platform?: string },
  ) => request("/notifications/devices", { method: "POST", token, body }),
  removeDevice: (token: string, deviceToken: string) =>
    request(`/notifications/devices/${encodeURIComponent(deviceToken)}`, { method: "DELETE", token }),
  notifications: (token: string, unreadOnly = false) =>
    request<any[]>(`/notifications${unreadOnly ? "?unread=1" : ""}`, { token }),
  markNotificationRead: (token: string, id: string) =>
    request(`/notifications/${id}/read`, { method: "PATCH", token }),
  markAllNotificationsRead: (token: string) => request("/notifications/read-all", { method: "PATCH", token }),
  sendTestNotification: (token: string) => request("/notifications/test", { method: "POST", token }),

  // ---- complaints ----
  complaintCategories: (token: string) => request<{ value: string; label: string }[]>("/complaints/categories", { token }),
  createComplaint: (token: string, body: { tripId: string; category: string; description: string }) =>
    request<any>("/complaints", { method: "POST", token, body }),
  myComplaints: (token: string) => request<any[]>("/complaints/mine", { token }),
  complaint: (token: string, id: string) => request<any>(`/complaints/${id}`, { token }),
  complaintMessage: (token: string, id: string, body: string) =>
    request<any>(`/complaints/${id}/messages`, { method: "POST", token, body: { body } }),
  adminComplaints: (token: string, filters: { status?: string; assignee?: string; priority?: string; overdue?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (filters.status) qs.set("status", filters.status);
    if (filters.assignee) qs.set("assignee", filters.assignee);
    if (filters.priority) qs.set("priority", filters.priority);
    if (filters.overdue) qs.set("overdue", "1");
    const q = qs.toString();
    return request<any[]>(`/admin/complaints${q ? `?${q}` : ""}`, { token });
  },
  complaintStaff: (token: string) =>
    request<{ id: string; fullName: string; phone: string; active: number; overdue: number }[]>("/admin/complaints/staff", { token }),
  complaintSla: (token: string, from?: string, to?: string) =>
    request<any>(`/admin/complaints/sla?${from ? `from=${from}&` : ""}${to ? `to=${to}` : ""}`, { token }),
  assignComplaint: (token: string, id: string, assigneeId: string | null) =>
    request<any>(`/admin/complaints/${id}/assign`, { method: "PATCH", token, body: { assigneeId } }),
  setComplaintPriority: (token: string, id: string, priority: string) =>
    request<any>(`/admin/complaints/${id}/priority`, { method: "PATCH", token, body: { priority } }),
  resolveComplaint: (
    token: string,
    id: string,
    body: { status: "IN_REVIEW" | "RESOLVED" | "REJECTED"; resolution?: string; refundAmount?: number; chargeDriver?: boolean },
  ) => request<any>(`/admin/complaints/${id}`, { method: "PATCH", token, body }),

  // ---- fleet / reports ----
  rateTrip: (token: string, tripId: string, body: { score: number; comment?: string }) =>
    request(`/trips/${tripId}/rating`, { method: "POST", token, body }),
  myDriverStats: (token: string) => request<any>("/drivers/me/stats", { token }),
  adminOverview: (token: string, from?: string, to?: string) =>
    request<any>(`/admin/reports/overview?${from ? `from=${from}&` : ""}${to ? `to=${to}` : ""}`, { token }),
  adminDriverStats: (token: string, driverId: string) => request<any>(`/admin/drivers/${driverId}/stats`, { token }),
  zones: (token: string) => request<any[]>("/admin/zones", { token }),
  zoneCoverage: (token: string, lat: number, lng: number) =>
    request<{ served: boolean; zone: { id: string; name: string } | null; enforcement: string; zonesConfigured: number }>(
      `/zones/coverage?lat=${lat}&lng=${lng}`,
      { token },
    ),
  updateZone: (
    token: string,
    id: string,
    body: { name?: string; radiusKm?: number; isActive?: boolean; centerLat?: number; centerLng?: number; polygon?: unknown },
  ) =>
    request(`/admin/zones/${id}`, { method: "PATCH", token, body }),
  deleteZone: (token: string, id: string) => request(`/admin/zones/${id}`, { method: "DELETE", token }),
  zoneStats: (token: string, from?: string, to?: string) =>
    request<any>(`/admin/reports/zones?${from ? `from=${from}&` : ""}${to ? `to=${to}` : ""}`, { token }),
  createZone: (
    token: string,
    body: { name: string; centerLat?: number; centerLng?: number; radiusKm?: number; polygon?: unknown },
  ) => request("/admin/zones", { method: "POST", token, body }),
  assignZone: (token: string, driverId: string, zoneId: string | null) =>
    request(`/admin/drivers/${driverId}/zone`, { method: "PATCH", token, body: { zoneId } }),

  registerVehicle: (
    token: string,
    body: { plateNumber: string; make: string; model: string; seats?: number },
  ) => request("/vehicles", { method: "POST", token, body }),

  myVehicles: (token: string) => request<any[]>("/vehicles/mine", { token }),

  updateDriverStatus: (token: string, status: "OFFLINE" | "AVAILABLE") =>
    request("/drivers/me/status", { method: "PATCH", token, body: { status } }),

  allDrivers: (token: string) => request<any[]>("/drivers", { token }),

  allVehicles: (token: string) => request<any[]>("/vehicles", { token }),

  allTrips: (token: string) => request<any[]>("/trips/all", { token }),

  availableGroups: (token: string) => request<any[]>("/trip-groups/available", { token }),

  myGroups: (token: string) => request<any[]>("/trip-groups/mine", { token }),

  acceptGroup: (token: string, groupId: string) =>
    request(`/trip-groups/${groupId}/accept`, { method: "POST", token }),

  advanceGroup: (token: string, groupId: string) =>
    request(`/trip-groups/${groupId}/advance`, { method: "PATCH", token }),
};
