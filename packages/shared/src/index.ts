export type UserRole = "CUSTOMER" | "DRIVER" | "ADMIN";

export type TripStatus =
  | "REQUESTED"
  | "ASSIGNED"
  | "ACCEPTED"
  | "REJECTED"
  | "EN_ROUTE_TO_PICKUP"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type TripType = "PRIVATE" | "SHARED";

export type TripGroupStatus = "MATCHING" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface CreateTripRequestDto {
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  tripType: TripType;
  seatsRequested?: number;
}

export interface TripStopDto {
  id: string;
  tripId: string;
  kind: "PICKUP" | "DROPOFF";
  sequence: number;
  address: string;
  lat: number;
  lng: number;
  completedAt: string | null;
}

export interface TripDto {
  id: string;
  status: TripStatus;
  tripType: TripType;
  pickupAddress: string;
  dropoffAddress: string;
  fare: string;
  customerId: string;
  driverId?: string | null;
  groupId?: string | null;
  requestedAt: string;
}

// -------- Realtime (Socket.io namespace /realtime) --------

/** Event names. Server → client unless noted. */
export const WS_EVENTS = {
  DRIVER_LOCATION: "driver:location",
  TRIP_NEW: "trip:new",
  TRIP_UPDATED: "trip:updated",
  GROUP_NEW: "group:new",
  GROUP_UPDATED: "group:updated",
  /** client → server */
  LOCATION_UPDATE: "location:update",
  SUBSCRIBE_TRIP: "subscribe:trip",
  SUBSCRIBE_GROUP: "subscribe:group",
} as const;

export interface DriverLocationEvent {
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  updatedAt: number;
}

export interface TripUpdatedEvent {
  tripId: string;
  status: TripStatus;
  groupId: string | null;
}

export interface GroupUpdatedEvent {
  groupId: string;
  status: TripGroupStatus;
  currentStopIndex: number;
}

export interface LocationUpdatePayload {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
}
