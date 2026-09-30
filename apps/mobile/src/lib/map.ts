export interface LatLng {
  lat: number;
  lng: number;
}

/** Decodes a Google/OSRM "polyline5" string (trip.routePolyline, /geo/route). */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const out: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push({ lat: lat / factor, lng: lng / factor });
  }
  return out;
}

/** Road geometry when available, otherwise straight segments through the waypoints. */
export function routePath(polyline: string | null | undefined, waypoints: LatLng[]): { points: LatLng[]; straight: boolean } {
  if (polyline) {
    const pts = decodePolyline(polyline);
    if (pts.length >= 2) return { points: pts, straight: false };
  }
  return { points: waypoints, straight: true };
}
