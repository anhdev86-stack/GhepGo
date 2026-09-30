import { BadRequestException } from '@nestjs/common';
import { parseRoutePoints } from './geo.controller.js';

describe('parseRoutePoints', () => {
  it('builds a two-point route from from/to', () => {
    expect(parseRoutePoints({ fromLat: 10.7, fromLng: 106.6, toLat: 10.8, toLng: 106.7 })).toEqual([
      { lat: 10.7, lng: 106.6 },
      { lat: 10.8, lng: 106.7 },
    ]);
  });

  it('parses ordered waypoints from points=lat,lng;lat,lng', () => {
    expect(parseRoutePoints({ points: '10.7,106.6; 10.75,106.65 ;10.8,106.7' })).toEqual([
      { lat: 10.7, lng: 106.6 },
      { lat: 10.75, lng: 106.65 },
      { lat: 10.8, lng: 106.7 },
    ]);
  });

  it('rejects malformed, too few or too many points', () => {
    expect(() => parseRoutePoints({ points: '10.7,106.6' })).toThrow(BadRequestException);
    expect(() => parseRoutePoints({ points: '10.7,106.6;abc' })).toThrow(BadRequestException);
    expect(() => parseRoutePoints({ points: '95,106.6;10.8,106.7' })).toThrow(BadRequestException);
    expect(() => parseRoutePoints({ points: Array.from({ length: 26 }, () => '10.7,106.6').join(';') })).toThrow(BadRequestException);
    expect(() => parseRoutePoints({ fromLat: 10.7 })).toThrow(BadRequestException);
  });
});
