// Crew rules: the rotating hiring pool, wages, morale, and service quality.
// Pure functions; candidate pools replay identically from (seed, week).

import type { CrewMember, GameState } from './types';
import type { CrewData, CrewRole } from './data/schemas';
import {
  CANDIDATES_PER_WEEK,
  CREW_MORALE_DECAY_PER_SAILING_DAY,
  CREW_MORALE_RECOVERY_PER_PORT_DAY,
  ENGINEER_FUEL_SAVING_PER_SKILL,
  SELF_SERVICE_QUALITY,
  TICKS_PER_WEEK,
  WAGE_SKILL_FACTOR,
  type NeedKind,
} from './constants';
import { mixSeed, mulberry32, rngInt } from './rng';

export interface Candidate {
  name: string;
  roleId: string;
  skill: number;
  wagePerDay: number;
}

export function wageFor(role: CrewRole, skill: number): number {
  return Math.round(role.wagePerDay * (WAGE_SKILL_FACTOR.base + skill * WAGE_SKILL_FACTOR.perSkill));
}

export function weekOfTick(tick: number): number {
  return Math.floor(tick / TICKS_PER_WEEK);
}

/**
 * The hiring pool for a given week — fully derived from (seed, week), so the
 * same candidates appear on every load until the week rolls over. Skill skews
 * low (1–3 common, 5 rare).
 */
export function candidatesForWeek(seed: number, week: number, crewData: CrewData): Candidate[] {
  const rng = mulberry32(mixSeed(seed, week));
  const candidates: Candidate[] = [];
  for (let i = 0; i < CANDIDATES_PER_WEEK; i++) {
    const role = crewData.roles[rngInt(rng, crewData.roles.length)]!;
    const skill = 1 + Math.floor(Math.pow(rng(), 1.4) * 5); // skew toward 1–3
    const name = `${crewData.firstNames[rngInt(rng, crewData.firstNames.length)]} ${
      crewData.lastNames[rngInt(rng, crewData.lastNames.length)]
    }`;
    candidates.push({ name, roleId: role.id, skill: Math.min(5, skill), wagePerDay: wageFor(role, Math.min(5, skill)) });
  }
  return candidates;
}

/** Σ wages per tick (wages are quoted per day). */
export function wagesPerTick(crew: CrewMember[]): number {
  return crew.reduce((s, c) => s + c.wagePerDay, 0) / 24;
}

/** One member's contribution to service quality: skill scaled by morale. */
function memberQuality(member: CrewMember): number {
  return (member.skill / 3) * (member.morale / 100);
}

/**
 * Service quality for a need: average quality of crew whose role serves it,
 * or a poor self-service floor when nobody does. ~0.8 with a decent hire,
 * up to ~1.67 with a 5-skill 100-morale specialist.
 */
export function serviceQuality(
  need: NeedKind,
  crew: CrewMember[],
  rolesById: Map<string, CrewRole>,
): number {
  const serving = crew.filter((c) => rolesById.get(c.roleId)?.serves === need);
  if (serving.length === 0) return SELF_SERVICE_QUALITY;
  return serving.reduce((s, c) => s + memberQuality(c), 0) / serving.length;
}

/** Fuel multiplier from the best engineer aboard (1.0 = no saving). */
export function engineerFuelMultiplier(crew: CrewMember[], rolesById: Map<string, CrewRole>): number {
  const best = Math.max(
    0,
    ...crew.filter((c) => c.roleId === 'engineer' && rolesById.has(c.roleId)).map((c) => c.skill),
  );
  return 1 - best * ENGINEER_FUEL_SAVING_PER_SKILL;
}

export function hasCaptain(crew: CrewMember[]): boolean {
  return crew.some((c) => c.roleId === 'captain');
}

/** Mutates draft state: morale drifts down at sea, recovers in port. */
export function stepCrewMorale(s: GameState): void {
  const sailing = s.ship.position.kind === 'sailing';
  const delta = sailing
    ? -CREW_MORALE_DECAY_PER_SAILING_DAY / 24
    : CREW_MORALE_RECOVERY_PER_PORT_DAY / 24;
  for (const member of s.crew) {
    member.morale = Math.max(0, Math.min(100, member.morale + delta));
  }
}
