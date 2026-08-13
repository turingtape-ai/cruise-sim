import { describe, expect, it } from 'vitest';
import { greatCirclePoint, greatCirclePoints, haversineNm } from './geo';

const MIAMI = { lat: 25.77, lon: -80.18 };
const NASSAU = { lat: 25.08, lon: -77.35 };
const BARCELONA = { lat: 41.38, lon: 2.18 };
const PALMA = { lat: 39.57, lon: 2.65 };

describe('haversineNm', () => {
  it('is zero for identical points', () => {
    expect(haversineNm(MIAMI, MIAMI)).toBe(0);
  });

  it('is symmetric', () => {
    expect(haversineNm(MIAMI, NASSAU)).toBeCloseTo(haversineNm(NASSAU, MIAMI), 9);
  });

  it('Miami → Nassau is roughly 160 nm', () => {
    const d = haversineNm(MIAMI, NASSAU);
    expect(d).toBeGreaterThan(140);
    expect(d).toBeLessThan(180);
  });

  it('Barcelona → Palma is roughly 110 nm', () => {
    const d = haversineNm(BARCELONA, PALMA);
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(125);
  });
});

describe('greatCirclePoint', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    const p0 = greatCirclePoint(MIAMI, NASSAU, 0);
    const p1 = greatCirclePoint(MIAMI, NASSAU, 1);
    expect(p0.lat).toBeCloseTo(MIAMI.lat, 6);
    expect(p0.lon).toBeCloseTo(MIAMI.lon, 6);
    expect(p1.lat).toBeCloseTo(NASSAU.lat, 6);
    expect(p1.lon).toBeCloseTo(NASSAU.lon, 6);
  });

  it('midpoint splits the distance in half', () => {
    const mid = greatCirclePoint(MIAMI, BARCELONA, 0.5);
    const total = haversineNm(MIAMI, BARCELONA);
    expect(haversineNm(MIAMI, mid)).toBeCloseTo(total / 2, 5);
    expect(haversineNm(mid, BARCELONA)).toBeCloseTo(total / 2, 5);
  });

  it('handles coincident points without NaN', () => {
    const p = greatCirclePoint(MIAMI, MIAMI, 0.5);
    expect(p.lat).toBeCloseTo(MIAMI.lat, 9);
    expect(p.lon).toBeCloseTo(MIAMI.lon, 9);
  });
});

describe('greatCirclePoints', () => {
  it('returns n+1 points from a to b', () => {
    const pts = greatCirclePoints(MIAMI, NASSAU, 16);
    expect(pts).toHaveLength(17);
    expect(pts[0]!.lat).toBeCloseTo(MIAMI.lat, 6);
    expect(pts[16]!.lon).toBeCloseTo(NASSAU.lon, 6);
  });
});
