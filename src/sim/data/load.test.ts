import { describe, expect, it } from 'vitest';
import { loadGameData } from './load';

describe('static game data', () => {
  const data = loadGameData();

  it('ships 40 valid ports', () => {
    expect(data.ports).toHaveLength(40);
  });

  it('covers all four regions', () => {
    const regions = new Set(data.ports.map((p) => p.region));
    expect(regions).toEqual(
      new Set(['caribbean', 'mediterranean', 'alaska', 'northern-europe']),
    );
  });

  it('every port has 4–8 attractions', () => {
    for (const p of data.ports) {
      expect(p.attractions.length, p.id).toBeGreaterThanOrEqual(4);
      expect(p.attractions.length, p.id).toBeLessThanOrEqual(8);
    }
  });

  it('every port has at least one excursion', () => {
    for (const p of data.ports) {
      expect(data.excursionsByPortId.get(p.id)?.length ?? 0, p.id).toBeGreaterThan(0);
    }
  });

  it('every excursion points at a real port', () => {
    for (const e of data.excursions) {
      expect(data.portsById.has(e.portId), e.id).toBe(true);
    }
  });

  it('dining has all three venue families', () => {
    expect(data.dining.buffets.length).toBeGreaterThan(0);
    expect(data.dining.restaurants.length).toBeGreaterThan(0);
    expect(data.dining.bars.length).toBeGreaterThan(0);
  });
});
