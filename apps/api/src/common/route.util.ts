import { haversineDistanceMeters } from './geo.util.js';

export interface RouteStop {
  tripId: string;
  kind: 'PICKUP' | 'DROPOFF';
  lat: number;
  lng: number;
  address: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Above this many free stops we fall back to greedy + 2-opt instead of exact search. */
const EXACT_SEARCH_MAX_STOPS = 10;

function dist(a: LatLng, b: LatLng) {
  return haversineDistanceMeters(a.lat, a.lng, b.lat, b.lng);
}

/**
 * Greedy nearest-neighbour ordering honouring pickup-before-dropoff.
 * `origin` is where the vehicle currently is (defaults to the first stop).
 */
export function orderStopsGreedy(stops: RouteStop[], origin?: LatLng): RouteStop[] {
  if (stops.length === 0) return [];

  const remaining = [...stops];
  const pickedUp = new Set<string>();
  const ordered: RouteStop[] = [];

  let current: LatLng;
  if (origin) {
    current = origin;
  } else {
    const first = remaining.shift()!;
    ordered.push(first);
    if (first.kind === 'PICKUP') pickedUp.add(first.tripId);
    current = first;
  }

  while (remaining.length > 0) {
    const eligible = remaining.filter((s) => s.kind === 'PICKUP' || pickedUp.has(s.tripId));
    const pool = eligible.length > 0 ? eligible : remaining;

    let best = pool[0];
    let bestDist = dist(current, best);
    for (const candidate of pool.slice(1)) {
      const d = dist(current, candidate);
      if (d < bestDist) {
        best = candidate;
        bestDist = d;
      }
    }

    ordered.push(best);
    if (best.kind === 'PICKUP') pickedUp.add(best.tripId);
    remaining.splice(remaining.indexOf(best), 1);
    current = best;
  }

  return ordered;
}

function isPrecedenceValid(order: RouteStop[], alreadyPickedUp: Set<string>): boolean {
  const seen = new Set(alreadyPickedUp);
  for (const s of order) {
    if (s.kind === 'PICKUP') seen.add(s.tripId);
    else if (!seen.has(s.tripId)) return false;
  }
  return true;
}

/** 2-opt local search that keeps only precedence-valid improvements. */
function twoOpt(order: RouteStop[], origin: LatLng | undefined, alreadyPickedUp: Set<string>): RouteStop[] {
  let best = order;
  let bestLen = routeLength(best, origin);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        if (!isPrecedenceValid(candidate, alreadyPickedUp)) continue;
        const len = routeLength(candidate, origin);
        if (len < bestLen - 1) {
          best = candidate;
          bestLen = len;
          improved = true;
        }
      }
    }
  }
  return best;
}

/**
 * Exact branch-and-bound over all precedence-valid permutations. Feasible for
 * a single vehicle carrying a handful of passengers (≤ 5 trips = 10 stops).
 */
function orderStopsExact(stops: RouteStop[], origin: LatLng | undefined, alreadyPickedUp: Set<string>): RouteStop[] {
  const greedy = twoOpt(orderStopsGreedy(stops, origin), origin, alreadyPickedUp);
  let bestOrder = greedy;
  let bestLen = routeLength(greedy, origin);

  const n = stops.length;
  const used: boolean[] = Array.from({ length: n }, () => false);
  const path: RouteStop[] = [];
  const pickedCount = new Map<string, number>();
  for (const id of alreadyPickedUp) pickedCount.set(id, 1);

  const recurse = (current: LatLng | undefined, len: number) => {
    if (len >= bestLen) return;
    if (path.length === n) {
      bestLen = len;
      bestOrder = [...path];
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const s = stops[i];
      if (s.kind === 'DROPOFF' && !(pickedCount.get(s.tripId) ?? 0)) continue;
      used[i] = true;
      path.push(s);
      if (s.kind === 'PICKUP') pickedCount.set(s.tripId, (pickedCount.get(s.tripId) ?? 0) + 1);
      recurse(s, len + (current ? dist(current, s) : 0));
      if (s.kind === 'PICKUP') pickedCount.set(s.tripId, (pickedCount.get(s.tripId) ?? 0) - 1);
      path.pop();
      used[i] = false;
    }
  };
  recurse(origin, 0);
  return bestOrder;
}

/**
 * Optimal (small n) or near-optimal (large n) ordering of stops.
 *
 * @param stops           stops still to visit
 * @param origin          vehicle's current position; omitted for a brand-new group
 * @param alreadyPickedUp trips whose PICKUP has been completed (their DROPOFF is free to place anywhere)
 */
export function orderStops(stops: RouteStop[], origin?: LatLng, alreadyPickedUp: Set<string> = new Set()): RouteStop[] {
  if (stops.length <= 1) return [...stops];
  if (stops.length <= EXACT_SEARCH_MAX_STOPS) return orderStopsExact(stops, origin, alreadyPickedUp);
  return twoOpt(orderStopsGreedy(stops, origin), origin, alreadyPickedUp);
}

export function routeLength(stops: LatLng[], origin?: LatLng): number {
  let total = 0;
  let prev = origin;
  for (const s of stops) {
    if (prev) total += dist(prev, s);
    prev = s;
  }
  return total;
}

export function totalRouteDistanceMeters(stops: LatLng[], origin?: LatLng): number {
  return Math.round(routeLength(stops, origin));
}
