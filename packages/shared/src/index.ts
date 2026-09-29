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

export type PaymentStatus = "PENDING" | "PAID" | "FAILED";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface CreateTripRequestDto {
  pickup: LatLng;
  pickupAddress: string;
  dropoff: LatLng;
  dropoffAddress: string;
  tripType: TripType;
}

export interface TripDto {
  id: string;
  status: TripStatus;
  tripType: TripType;
  pickupAddress: string;
  dropoffAddress: string;
  fare: number;
  customerId: string;
  driverId?: string | null;
  createdAt: string;
}
