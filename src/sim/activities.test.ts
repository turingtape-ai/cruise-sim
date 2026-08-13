import { describe, expect, it } from 'vitest';
import {
  effectiveCapacity,
  runEventProgram,
  runExcursions,
  tagAffinity,
  themeFitsModule,
  themeMultiplier,
  themeUpkeepPerDay,
} from './activities';
import { loadGameData } from './data/load';
import { starterLayout } from './ship';
import { starterCrew } from './state';
import { startCruise } from './passengers';
import { EXCURSION_CUT, TAG_MATCH_BONUS } from './constants';

const data = loadGameData();
const { modulesById, diningThemesById, crewRolesById, eventsById, excursionsByPortId } = data;

const theme = (id: string) => diningThemesById.get(id)!;

describe('themes', () => {
  it('flattens all dining venues with their kinds', () => {
    expect(theme('buffet-tropicana').kind).toBe('buffet');
    expect(theme('rest-omakase').kind).toBe('restaurant');
    expect(theme('bar-tiki').kind).toBe('bar');
  });

  it('theme kind must match the module', () => {
    expect(themeFitsModule(theme('buffet-tropicana'), 'buffet')).toBe(true);
    expect(themeFitsModule(theme('buffet-tropicana'), 'restaurant')).toBe(false);
    expect(themeFitsModule(theme('bar-tiki'), 'bar')).toBe(true);
  });

  it('appeal raises the service multiplier', () => {
    expect(themeMultiplier(undefined)).toBe(1);
    expect(themeMultiplier(theme('rest-omakase'))).toBeGreaterThan(
      themeMultiplier(theme('buffet-midnight')),
    );
  });

  it('tag affinity favors matching archetypes, capped', () => {
    expect(tagAffinity(['party', 'night'], 'party-groups')).toBeCloseTo(
      1 + 2 * TAG_MATCH_BONUS,
      9,
    );
    expect(tagAffinity(['party', 'night', 'tropical'], 'party-groups')).toBeCloseTo(
      1 + 2 * TAG_MATCH_BONUS,
      9,
    ); // capped at 2
    expect(tagAffinity(['party', 'night'], 'retirees')).toBe(1);
  });

  it('themed venues serve more effective capacity and add upkeep', () => {
    const plain = starterLayout('coastal');
    const themed = structuredClone(plain);
    const buffet = themed.placed.find((p) => p.moduleId === 'buffet')!;
    buffet.themeId = 'buffet-tropicana'; // party/comfort/outdoor tags, appeal 6

    const plainCap = effectiveCapacity(plain, modulesById, diningThemesById, 'party-groups');
    const themedCap = effectiveCapacity(themed, modulesById, diningThemesById, 'party-groups');
    expect(themedCap.food).toBeGreaterThan(plainCap.food);

    expect(themeUpkeepPerDay(plain, diningThemesById)).toBe(0);
    expect(themeUpkeepPerDay(themed, diningThemesById)).toBe(theme('buffet-tropicana').cost);
  });
});

describe('runExcursions', () => {
  it('boosts fun/novelty, respects capacity, and pays the cut', () => {
    const cruise = startCruise(0, 'miami', 100);
    for (const g of cruise.groups) {
      g.needs.fun = 40;
      g.needs.novelty = 40;
    }
    const excursions = excursionsByPortId.get('cozumel')!;
    const result = runExcursions(cruise, excursions, starterCrew(), crewRolesById);
    expect(result.participants).toBeGreaterThan(0);
    expect(result.cut).toBeGreaterThan(0);
    expect(cruise.groups[0]!.needs.fun).toBeGreaterThan(40);
    expect(cruise.groups[0]!.needs.novelty).toBeGreaterThan(40);
    // Cut is exactly EXCURSION_CUT of revenue, so bounded by capacity × price.
    const maxRevenue = excursions.reduce((s, e) => s + e.capacity * e.pricePerGuest, 0);
    expect(result.cut).toBeLessThanOrEqual(maxRevenue * EXCURSION_CUT + 1e-9);
  });

  it('an excursion guide amplifies the boost', () => {
    const without = startCruise(0, 'miami', 50);
    const withGuide = startCruise(0, 'miami', 50);
    for (const c of [without, withGuide]) c.groups.forEach((g) => (g.needs.novelty = 40));
    const excursions = excursionsByPortId.get('nassau')!;
    const guide = [
      ...starterCrew(),
      { id: 9, name: 'Wesley Costa', roleId: 'excursion-guide', skill: 5, wagePerDay: 0, morale: 100 },
    ];
    runExcursions(without, excursions, starterCrew(), crewRolesById);
    runExcursions(withGuide, excursions, guide, crewRolesById);
    expect(withGuide.groups[0]!.needs.novelty).toBeGreaterThan(without.groups[0]!.needs.novelty);
  });

  it('returns zeros with no excursions or guests', () => {
    const cruise = startCruise(0, 'miami', 0);
    expect(runExcursions(cruise, [], starterCrew(), crewRolesById)).toEqual({
      participants: 0,
      cut: 0,
    });
  });
});

describe('runEventProgram', () => {
  it('runs only events whose venue is aboard, charging per run', () => {
    const layout = starterLayout('coastal'); // has bar, no theater
    const cruise = startCruise(0, 'miami', 8);
    cruise.groups.forEach((g) => (g.needs.fun = 50));
    const result = runEventProgram(
      cruise,
      ['trivia-night', 'evening-show'],
      eventsById,
      layout,
      starterCrew(),
      crewRolesById,
    );
    expect(result.ran.map((e) => e.id)).toEqual(['trivia-night']);
    expect(result.cost).toBe(eventsById.get('trivia-night')!.costPerRun);
    expect(cruise.groups[0]!.needs.fun).toBeGreaterThan(50);
  });

  it('negative boosts apply unscaled (deck party costs some rest)', () => {
    const layout = starterLayout('coastal');
    layout.placed.push({ id: 99, moduleId: 'pool', deck: 0, x: 6 });
    const cruise = startCruise(0, 'miami', 8);
    cruise.groups.forEach((g) => {
      g.needs.fun = 50;
      g.needs.rest = 50;
    });
    runEventProgram(cruise, ['deck-party'], eventsById, layout, starterCrew(), crewRolesById);
    expect(cruise.groups[0]!.needs.fun).toBeGreaterThan(50);
    expect(cruise.groups[0]!.needs.rest).toBeLessThan(50);
  });

  it('an empty program is free and does nothing', () => {
    const cruise = startCruise(0, 'miami', 8);
    const result = runEventProgram(
      cruise,
      [],
      eventsById,
      starterLayout('coastal'),
      starterCrew(),
      crewRolesById,
    );
    expect(result).toEqual({ ran: [], cost: 0 });
  });
});
