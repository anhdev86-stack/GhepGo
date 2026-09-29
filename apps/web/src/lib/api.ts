const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const message = (data && (data.message?.toString() ?? data.error)) || res.statusText;
    throw new ApiError(Array.isArray(message) ? message.join(", ") : message, res.status);
  }

  return data as T;
}

export interface AuthResponse {
  accessToken: string;
  user: { id: string; phone: string; role: "CUSTOMER" | "DRIVER" | "ADMIN"; fullName: string };
}

export const api = {
  register: (body: { phone: string; password: string; fullName: string; role: "CUSTOMER" | "DRIVER" }) =>
    request<AuthResponse>("/auth/register", { method: "POST", body }),

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
    },
  ) => request("/trips", { method: "POST", token, body }),

  myTrips: (token: string) => request<any[]>("/trips/mine", { token }),

  availableTrips: (token: string) => request<any[]>("/trips/available", { token }),

  myDriverTrips: (token: string) => request<any[]>("/trips/driver/mine", { token }),

  acceptTrip: (token: string, tripId: string) =>
    request(`/trips/${tripId}/accept`, { method: "POST", token }),

  updateTripStatus: (token: string, tripId: string, status: string) =>
    request(`/trips/${tripId}/status`, { method: "PATCH", token, body: { status } }),

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
