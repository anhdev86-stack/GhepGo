const EARTH_RADIUS_METERS = 6371000;

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

const BASE_FARE_VND = 15000;
export const PER_KM_VND = 11000;
const AVERAGE_SPEED_MPS = 8.3; // ~30 km/h in city traffic

export function estimateFare(distanceMeters: number): number {
  const distanceKm = distanceMeters / 1000;
  return Math.round(BASE_FARE_VND + distanceKm * PER_KM_VND);
}

export function estimateDurationSecs(distanceMeters: number): number {
  return Math.round(distanceMeters / AVERAGE_SPEED_MPS);
}
