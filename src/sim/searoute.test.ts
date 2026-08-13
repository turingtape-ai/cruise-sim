import { describe, expect, it } from 'vitest';
import { isWater, pathLengthNm, pointAlongPath, seaRoute } from './searoute';
import { greatCirclePoint, haversineNm } from './geo';
import { loadGameData } from './data/load';

const { portsById } = loadGameData();
const port = (id: string) => portsById.get(id)!;

/**
 * Sample a route finely and assert every open-sea point is water. Points
 * within 60 nm of either terminal are exempt: ports sit inside coastal cells,
 * so the harbor approach is below grid resolution by construction.
 */
function assertAllWater(points: { lat: number; lon: number }[]): void {
  const start = points[0]!;
  const end = points[points.length - 1]!;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const n = Math.max(2, Math.ceil(haversineNm(a, b) / 20));
    for (let k = 1; k < n; k++) {
      const p = greatCirclePoint(a, b, k / n);
      if (haversineNm(p, start) < 60 || haversineNm(p, end) < 60) continue;
      expect(isWater(p.lat, p.lon), `land at ${p.lat.toFixed(2)},${p.lon.toFixed(2)}`).toBe(true);
    }
  }
}

describe('water mask', () => {
  it('knows open ocean from continental interior', () => {
    expect(isWater(25, -75)).toBe(true); // open Atlantic
    expect(isWater(0, -30)).toBe(true); // equatorial Atlantic
    expect(isWater(39, -98)).toBe(false); // Kansas
    expect(isWater(22.2, -79.8)).toBe(false); // central Cuba
    expect(isWater(46, 8)).toBe(false); // the Alps
  });
});

describe('seaRoute', () => {
  it('Miami → Cozumel goes around Cuba, not through it', () => {
    const route = seaRoute(port('miami'), port('cozumel'));
    const direct = haversineNm(port('miami'), port('cozumel'));
    expect(route.nm).toBeGreaterThan(direct); // must detour
    expect(route.nm).toBeLessThan(direct * 2); // but not absurdly
    assertAllWater(route.points);
  });

  it('Seattle → Juneau threads the coast without crossing land', () => {
    const route = seaRoute(port('seattle'), port('juneau'));
    const direct = haversineNm(port('seattle'), port('juneau'));
    expect(route.nm).toBeGreaterThanOrEqual(direct);
    expect(route.nm).toBeLessThan(direct * 2.5);
    assertAllWater(route.points);
  });

  it('Barcelona → Civitavecchia stays close to the direct line', () => {
    const route = seaRoute(port('barcelona'), port('civitavecchia'));
    const direct = haversineNm(port('barcelona'), port('civitavecchia'));
    expect(route.nm).toBeGreaterThanOrEqual(direct - 1e-9);
    expect(route.nm).toBeLessThan(direct * 1.5);
    assertAllWater(route.points);
  });

  it('Copenhagen → Reykjavík rounds Scandinavia through open sea', () => {
    const route = seaRoute(port('copenhagen'), port('reykjavik'));
    assertAllWater(route.points);
  });

  it('every adjacent-region port pair in the seeded route regions resolves', () => {
    const pairs: [string, string][] = [
      ['miami', 'nassau'],
      ['nassau', 'san-juan'],
      ['san-juan', 'bridgetown'],
      ['venice', 'dubrovnik'],
      ['piraeus', 'santorini'],
      ['vancouver', 'ketchikan'],
      ['stockholm', 'helsinki'],
      ['bergen', 'geiranger'],
    ];
    for (const [a, b] of pairs) {
      const route = seaRoute(port(a), port(b));
      expect(route.nm, `${a}→${b}`).toBeGreaterThan(0);
      expect(route.points.length, `${a}→${b}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('is memoized: repeated calls return the identical object', () => {
    const a = seaRoute(port('miami'), port('cozumel'));
    const b = seaRoute(port('miami'), port('cozumel'));
    expect(b).toBe(a);
  });
});

describe('pointAlongPath', () => {
  const route = seaRoute(port('miami'), port('cozumel'));

  it('clamps to the endpoints', () => {
    const start = pointAlongPath(route.points, 0);
    const end = pointAlongPath(route.points, route.nm + 500);
    expect(start.lat).toBeCloseTo(port('miami').lat, 6);
    expect(end.lat).toBeCloseTo(port('cozumel').lat, 6);
  });

  it('walks the full length consistently', () => {
    expect(pathLengthNm(route.points)).toBeCloseTo(route.nm, 6);
    const mid = pointAlongPath(route.points, route.nm / 2);
    const before = pointAlongPath(route.points, route.nm / 2 - 30);
    expect(haversineNm(before, mid)).toBeCloseTo(30, 0);
  });
});
