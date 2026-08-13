import { describe, expect, it } from 'vitest';
import {
  candidatesForWeek,
  engineerFuelMultiplier,
  hasCaptain,
  serviceQuality,
  wagesPerTick,
} from './crew';
import { loadGameData } from './data/load';
import { starterCrew } from './state';
import { SELF_SERVICE_QUALITY } from './constants';
import type { CrewMember } from './types';

const { crewData, crewRolesById } = loadGameData();

const member = (roleId: string, skill: number, morale = 100, id = 99): CrewMember => ({
  id,
  name: 'Test Person',
  roleId,
  skill,
  wagePerDay: 100,
  morale,
});

describe('candidatesForWeek', () => {
  it('is deterministic for the same seed and week', () => {
    const a = candidatesForWeek(1234, 7, crewData);
    const b = candidatesForWeek(1234, 7, crewData);
    expect(a).toEqual(b);
  });

  it('rotates with the week and differs across seeds', () => {
    const a = candidatesForWeek(1234, 7, crewData);
    const b = candidatesForWeek(1234, 8, crewData);
    const c = candidatesForWeek(4321, 7, crewData);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('produces valid roles, skills, and skill-scaled wages', () => {
    for (const c of candidatesForWeek(42, 0, crewData)) {
      const role = crewRolesById.get(c.roleId);
      expect(role).toBeDefined();
      expect(c.skill).toBeGreaterThanOrEqual(1);
      expect(c.skill).toBeLessThanOrEqual(5);
      expect(c.wagePerDay).toBeGreaterThanOrEqual(role!.wagePerDay * 0.85);
      expect(c.name).toMatch(/\S+ \S+/);
    }
  });
});

describe('serviceQuality', () => {
  it('falls back to self-service with no covering crew', () => {
    expect(serviceQuality('food', [], crewRolesById)).toBe(SELF_SERVICE_QUALITY);
    expect(serviceQuality('food', [member('entertainer', 5)], crewRolesById)).toBe(
      SELF_SERVICE_QUALITY,
    );
  });

  it('scales with skill and morale', () => {
    const good = serviceQuality('food', [member('chef', 3, 100)], crewRolesById);
    const tired = serviceQuality('food', [member('chef', 3, 50)], crewRolesById);
    const expert = serviceQuality('food', [member('chef', 5, 100)], crewRolesById);
    expect(good).toBeCloseTo(1, 9);
    expect(tired).toBeCloseTo(0.5, 9);
    expect(expert).toBeGreaterThan(good);
  });
});

describe('crew helpers', () => {
  it('wagesPerTick divides daily wages by 24', () => {
    const crew = starterCrew();
    const daily = crew.reduce((s, c) => s + c.wagePerDay, 0);
    expect(wagesPerTick(crew)).toBeCloseTo(daily / 24, 9);
  });

  it('engineer trims fuel by 3% per skill point', () => {
    expect(engineerFuelMultiplier([], crewRolesById)).toBe(1);
    expect(engineerFuelMultiplier([member('engineer', 4)], crewRolesById)).toBeCloseTo(0.88, 9);
  });

  it('detects captains', () => {
    expect(hasCaptain(starterCrew())).toBe(true);
    expect(hasCaptain([member('chef', 3)])).toBe(false);
  });
});
