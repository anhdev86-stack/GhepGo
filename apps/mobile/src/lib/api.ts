const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/api";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

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

  register: (data: { phone: string; password: string; fullName: string; role: string }) =>
    request<any>("/auth/register", { method: "POST", body: JSON.stringify(data) }),

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
};
