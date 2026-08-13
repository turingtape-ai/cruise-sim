import { describe, expect, it } from 'vitest';
import {
  buildGroups,
  grantNoveltyBoost,
  groupSatisfaction,
  satisfactionToStars,
  serviceCapacity,
  startCruise,
  stepNeeds,
} from './passengers';
import { loadGameData } from './data/load';
import { starterCrew } from './state';
import { starterLayout } from './ship';
import { NEED_START } from './constants';

const { modulesById, crewRolesById } = loadGameData();

describe('buildGroups', () => {
  it('splits guests across archetypes summing exactly to the total', () => {
    for (const guests of [1, 7, 34, 213]) {
      const groups = buildGroups(guests);
      expect(groups.reduce((s, g) => s + g.count, 0)).toBe(guests);
    }
  });

  it('starts every need at NEED_START', () => {
    const groups = buildGroups(50);
    for (const g of groups) {
      expect(Object.values(g.needs).every((v) => v === NEED_START)).toBe(true);
    }
  });
});

describe('serviceCapacity', () => {
  it('maps venue capacities to needs and cabins to rest', () => {
    const layout = starterLayout('coastal');
    const cap = serviceCapacity(layout.placed, modulesById);
    expect(cap.food).toBe(60); // Lido buffet
    expect(cap.fun).toBe(20); // bar
    expect(cap.rest).toBe(8); // 4 starter cabins × 2
  });
});

describe('stepNeeds', () => {
  it('needs fall without any service and rise with strong service', () => {
    const starved = startCruise(0, 'miami', 8);
    const zeroCap = { food: 0, fun: 0, rest: 0, novelty: 0 };
    for (let t = 1; t <= 24; t++) stepNeeds(starved, t, () => zeroCap, [], crewRolesById);
    const g = starved.groups[0]!;
    expect(g.needs.food).toBeLessThan(NEED_START - 30);

    const served = startCruise(0, 'miami', 8);
    const bigCap = { food: 100, fun: 100, rest: 100, novelty: 0 };
    const eliteCrew = starterCrew().map((c) => ({ ...c, skill: 5, morale: 100 }));
    for (let t = 1; t <= 24; t++) stepNeeds(served, t, () => bigCap, eliteCrew, crewRolesById);
    expect(served.groups[0]!.needs.food).toBeGreaterThan(starved.groups[0]!.needs.food + 20);
  });

  it('novelty decays at sea and never regenerates from service', () => {
    const cruise = startCruise(0, 'miami', 10);
    const cap = { food: 100, fun: 100, rest: 100, novelty: 100 };
    for (let t = 1; t <= 48; t++) stepNeeds(cruise, t, () => cap, starterCrew(), crewRolesById);
    expect(cruise.groups[0]!.needs.novelty).toBeLessThan(NEED_START);
  });

  it('accumulates need totals for cruise averages', () => {
    const cruise = startCruise(0, 'miami', 10);
    const cap = { food: 0, fun: 0, rest: 0, novelty: 0 };
    stepNeeds(cruise, 1, () => cap, [], crewRolesById);
    stepNeeds(cruise, 2, () => cap, [], crewRolesById);
    expect(cruise.ticks).toBe(2);
    expect(cruise.groups[0]!.needTotals.food).toBeGreaterThan(0);
  });
});

describe('grantNoveltyBoost', () => {
  it('boosts once per port and never for the home port', () => {
    const cruise = startCruise(0, 'miami', 10);
    const before = cruise.groups[0]!.needs.novelty;
    expect(grantNoveltyBoost(cruise, 'miami')).toBe(false); // home already visited
    expect(grantNoveltyBoost(cruise, 'nassau')).toBe(true);
    expect(cruise.groups[0]!.needs.novelty).toBeGreaterThan(before);
    expect(grantNoveltyBoost(cruise, 'nassau')).toBe(false); // no double dip
  });
});

describe('satisfaction & stars', () => {
  it('perfect needs give 5 stars, empty needs give the floor', () => {
    const cruise = startCruise(0, 'miami', 10);
    const g = cruise.groups[0]!;
    g.needTotals = { food: 1000, fun: 1000, rest: 1000, novelty: 1000 };
    expect(groupSatisfaction(g, 10)).toBeCloseTo(100, 6);
    expect(satisfactionToStars(100)).toBe(5);
    expect(satisfactionToStars(0)).toBe(0.5);
  });

  it('rounds stars to halves', () => {
    for (const s of [10, 35, 62, 88]) {
      const stars = satisfactionToStars(s);
      expect(stars * 2).toBeCloseTo(Math.round(stars * 2), 9);
    }
  });
});
