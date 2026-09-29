import { orderStops, orderStopsGreedy, totalRouteDistanceMeters, type RouteStop } from './route.util.js';

// Rough Ho Chi Minh City coordinates on a north-south line for easy reasoning.
const stop = (tripId: string, kind: 'PICKUP' | 'DROPOFF', lat: number, lng = 106.7): RouteStop => ({
  tripId,
  kind,
  lat,
  lng,
  address: `${tripId}-${kind}`,
});

const pickupBeforeDropoff = (order: RouteStop[]) => {
  const seen = new Set<string>();
  for (const s of order) {
    if (s.kind === 'PICKUP') seen.add(s.tripId);
    else if (!seen.has(s.tripId)) return false;
  }
  return true;
};

describe('orderStops', () => {
  it('returns an empty list for no stops', () => {
    expect(orderStops([])).toEqual([]);
  });

  it('never drops a passenger before picking them up', () => {
    const stops = [
      stop('a', 'DROPOFF', 10.80),
      stop('a', 'PICKUP', 10.70),
      stop('b', 'DROPOFF', 10.75),
      stop('b', 'PICKUP', 10.72),
    ];
    const order = orderStops(stops);
    expect(order).toHaveLength(4);
    expect(pickupBeforeDropoff(order)).toBe(true);
  });

  it('finds a shorter or equal route than the greedy heuristic', () => {
    const stops = [
      stop('a', 'PICKUP', 10.70, 106.70),
      stop('a', 'DROPOFF', 10.80, 106.70),
      stop('b', 'PICKUP', 10.71, 106.75),
      stop('b', 'DROPOFF', 10.79, 106.65),
      stop('c', 'PICKUP', 10.72, 106.68),
      stop('c', 'DROPOFF', 10.78, 106.72),
    ];
    const origin = { lat: 10.69, lng: 106.7 };
    const greedy = totalRouteDistanceMeters(orderStopsGreedy(stops, origin), origin);
    const optimal = totalRouteDistanceMeters(orderStops(stops, origin), origin);
    expect(optimal).toBeLessThanOrEqual(greedy);
  });

  it('allows a dropoff first when the passenger was already picked up', () => {
    const stops = [stop('a', 'DROPOFF', 10.71), stop('b', 'PICKUP', 10.90), stop('b', 'DROPOFF', 10.95)];
    const origin = { lat: 10.7, lng: 106.7 };
    const order = orderStops(stops, origin, new Set(['a']));
    expect(order[0].tripId).toBe('a');
    expect(order[0].kind).toBe('DROPOFF');
  });

  it('falls back to a heuristic for many stops without violating precedence', () => {
    const stops: RouteStop[] = [];
    for (let i = 0; i < 7; i++) {
      stops.push(stop(`t${i}`, 'PICKUP', 10.7 + Math.random() * 0.1, 106.6 + Math.random() * 0.1));
      stops.push(stop(`t${i}`, 'DROPOFF', 10.7 + Math.random() * 0.1, 106.6 + Math.random() * 0.1));
    }
    const order = orderStops(stops);
    expect(order).toHaveLength(14);
    expect(pickupBeforeDropoff(order)).toBe(true);
  });
});
