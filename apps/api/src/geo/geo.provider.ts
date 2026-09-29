export interface GeoPlace {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

export interface GeoRoute {
  distanceMeters: number;
  durationSecs: number;
  /** Encoded polyline (Google/OSRM polyline5) when the provider returns one. */
  polyline?: string;
}

export interface GeoProvider {
  readonly name: string;
  autocomplete(query: string, near?: { lat: number; lng: number }): Promise<GeoPlace[]>;
  route(points: { lat: number; lng: number }[]): Promise<GeoRoute | null>;
  /** Nearest address for a coordinate (map tap / marker drag). */
  reverse(lat: number, lng: number): Promise<GeoPlace | null>;
}
