/**
 * Realtime contract shared by API, web and mobile.
 * Keep in sync with packages/shared/src/index.ts (RealtimeEvent*).
 */
export const REDIS_CHANNEL = 'ghepgo:events';

export type RealtimeEvent =
  | { type: 'driver.location'; driverId: string; lat: number; lng: number; heading?: number; speed?: number; updatedAt: number; tripIds: string[]; groupIds: string[] }
  | { type: 'trip.created'; trip: { id: string; tripType: string; pickupAddress: string; dropoffAddress: string; pickupLat: number; pickupLng: number; fare: string | number; distanceMeters: number | null } }
  | { type: 'trip.updated'; tripId: string; customerId: string; driverUserId?: string | null; status: string; groupId?: string | null }
  | { type: 'group.created'; groupId: string }
  | { type: 'group.updated'; groupId: string; status: string; currentStopIndex: number; customerIds: string[]; driverUserId?: string | null };

/** Socket.io event names emitted to clients. */
export const WS = {
  DRIVER_LOCATION: 'driver:location',
  TRIP_NEW: 'trip:new',
  TRIP_UPDATED: 'trip:updated',
  GROUP_NEW: 'group:new',
  GROUP_UPDATED: 'group:updated',
  // client → server
  LOCATION_UPDATE: 'location:update',
  SUBSCRIBE_TRIP: 'subscribe:trip',
  SUBSCRIBE_GROUP: 'subscribe:group',
} as const;

export const rooms = {
  user: (userId: string) => `user:${userId}`,
  trip: (tripId: string) => `trip:${tripId}`,
  group: (groupId: string) => `group:${groupId}`,
  driversAvailable: 'drivers:available',
  admins: 'admins',
};
