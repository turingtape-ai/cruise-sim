import { EARTH_RADIUS_NM } from './constants';

export interface LatLon {
  lat: number;
  lon: number;
}

const DEG = Math.PI / 180;

/** Great-circle distance in nautical miles (haversine). */
export function haversineNm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

type Vec3 = [number, number, number];

function toUnitVec({ lat, lon }: LatLon): Vec3 {
  const phi = lat * DEG;
  const lambda = lon * DEG;
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
}

function toLatLon([x, y, z]: Vec3): LatLon {
  return { lat: Math.asin(Math.max(-1, Math.min(1, z))) / DEG, lon: Math.atan2(y, x) / DEG };
}

/**
 * Point along the great circle from a to b at fraction t ∈ [0,1] (spherical interpolation).
 * Used by the sim for ship position and by the renderer for arc geometry.
 */
export function greatCirclePoint(a: LatLon, b: LatLon, t: number): LatLon {
  const va = toUnitVec(a);
  const vb = toUnitVec(b);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-9) return { ...a };
  const s = Math.sin(omega);
  const k0 = Math.sin((1 - t) * omega) / s;
  const k1 = Math.sin(t * omega) / s;
  return toLatLon([k0 * va[0] + k1 * vb[0], k0 * va[1] + k1 * vb[1], k0 * va[2] + k1 * vb[2]]);
}

/** n+1 points sampling the great circle from a to b (inclusive of both ends). */
export function greatCirclePoints(a: LatLon, b: LatLon, n: number): LatLon[] {
  const pts: LatLon[] = [];
  for (let i = 0; i <= n; i++) pts.push(greatCirclePoint(a, b, i / n));
  return pts;
}
