import { describe, expect, it } from 'vitest';
import { nextPortId, summarizeRoute } from './route';
import { loadGameData } from './data/load';
import { PORT_STAY_HOURS, SHIP_SPEED_KNOTS } from './constants';

const { portsById } = loadGameData();

describe('summarizeRoute', () => {
  it('returns null for routes shorter than 2 ports', () => {
    expect(summarizeRoute([], portsById, 'coastal')).toBeNull();
    expect(summarizeRoute(['miami'], portsById, 'coastal')).toBeNull();
  });

  it('closes the loop: N ports produce N legs', () => {
    const summary = summarizeRoute(['miami', 'nassau', 'cozumel'], portsById, 'coastal');
    expect(summary).not.toBeNull();
    expect(summary!.legs).toHaveLength(3);
    expect(summary!.legs[2]!.fromPortId).toBe('cozumel');
    expect(summary!.legs[2]!.toPortId).toBe('miami');
  });

  it('totals add up and include port stays', () => {
    const summary = summarizeRoute(['miami', 'nassau'], portsById, 'coastal')!;
    const legSum = summary.legs.reduce((s, l) => s + l.nm, 0);
    expect(summary.totalNm).toBeCloseTo(legSum, 9);
    const expectedHours = legSum / SHIP_SPEED_KNOTS.coastal + 2 * PORT_STAY_HOURS;
    expect(summary.totalHours).toBeCloseTo(expectedHours, 9);
    expect(summary.totalDays).toBeCloseTo(expectedHours / 24, 9);
  });

  it('throws on unknown port ids', () => {
    expect(() => summarizeRoute(['miami', 'atlantis-city'], portsById, 'coastal')).toThrow();
  });
});

describe('nextPortId', () => {
  const route = ['miami', 'nassau', 'cozumel'];

  it('advances along the route and loops at the end', () => {
    expect(nextPortId(route, 'miami')).toBe('nassau');
    expect(nextPortId(route, 'nassau')).toBe('cozumel');
    expect(nextPortId(route, 'cozumel')).toBe('miami');
  });

  it('sends a ship outside the route to the first stop', () => {
    expect(nextPortId(route, 'barcelona')).toBe('miami');
  });

  it('returns null when there is no route to sail', () => {
    expect(nextPortId([], 'miami')).toBeNull();
    expect(nextPortId(['miami'], 'miami')).toBeNull();
  });
});
