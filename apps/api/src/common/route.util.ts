import { haversineDistanceMeters } from './geo.util.js';

export interface RouteStop {
  tripId: string;
  kind: 'PICKUP' | 'DROPOFF';
  lat: number;
  lng: number;
  address: string;
}

/**
 * Greedy nearest-neighbor ordering, honoring the constraint that a trip's
 * DROPOFF can only be visited after its own PICKUP. Good enough heuristic for
 * small stop counts (a handful of shared passengers per vehicle).
 */
export function orderStops(stops: RouteStop[]): RouteStop[] {
  if (stops.length === 0) return [];

  const remaining = [...stops];
  const visitedPickup = new Set<string>();
  const ordered: RouteStop[] = [];

  let current = remaining.shift()!;
  ordered.push(current);
  if (current.kind === 'PICKUP') visitedPickup.add(current.tripId);

  while (remaining.length > 0) {
    const eligible = remaining.filter((s) => s.kind === 'PICKUP' || visitedPickup.has(s.tripId));
    const pool = eligible.length > 0 ? eligible : remaining;

    let best = pool[0];
    let bestDist = haversineDistanceMeters(current.lat, current.lng, best.lat, best.lng);
    for (const candidate of pool.slice(1)) {
      const dist = haversineDistanceMeters(current.lat, current.lng, candidate.lat, candidate.lng);
      if (dist < bestDist) {
        best = candidate;
        bestDist = dist;
      }
    }

    ordered.push(best);
    if (best.kind === 'PICKUP') visitedPickup.add(best.tripId);
    remaining.splice(remaining.indexOf(best), 1);
    current = best;
  }

  return ordered;
}

export function totalRouteDistanceMeters(stops: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    total += haversineDistanceMeters(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng);
  }
  return Math.round(total);
}
