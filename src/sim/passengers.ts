// Passenger cohorts and the needs simulation (GAME_RULES §4.2/§4.2b).
// Cohorts are archetype groups with averaged needs — not individual agents.

import type { CrewMember, CruiseState, GameState, PassengerGroup } from './types';
import type { CrewRole, ShipModule } from './data/schemas';
import {
  ARCHETYPE_MIX,
  ARCHETYPE_NEED_WEIGHTS,
  NEED_DECAY_PER_TICK,
  NEED_REGEN_PER_TICK,
  NEED_START,
  NIGHT_HOURS,
  NOVELTY_PORT_BOOST,
  REPUTATION_SMOOTHING,
  type Archetype,
  type NeedKind,
} from './constants';
import { serviceQuality } from './crew';
import { tickToDate } from './time';

const NEEDS: NeedKind[] = ['food', 'fun', 'rest', 'novelty'];

const freshNeeds = (): Record<NeedKind, number> => ({
  food: NEED_START,
  fun: NEED_START,
  rest: NEED_START,
  novelty: NEED_START,
});

const zeroNeeds = (): Record<NeedKind, number> => ({ food: 0, fun: 0, rest: 0, novelty: 0 });

/** Split `guests` across archetypes by ARCHETYPE_MIX (largest remainder). */
export function buildGroups(guests: number): PassengerGroup[] {
  const entries = Object.entries(ARCHETYPE_MIX) as [Archetype, number][];
  const raw = entries.map(([archetype, frac]) => ({ archetype, exact: guests * frac }));
  const counts = raw.map((r) => Math.floor(r.exact));
  let remaining = guests - counts.reduce((s, c) => s + c, 0);
  const byRemainder = raw
    .map((r, i) => ({ i, rem: r.exact - Math.floor(r.exact) }))
    .sort((a, b) => b.rem - a.rem);
  for (const { i } of byRemainder) {
    if (remaining <= 0) break;
    counts[i]! += 1;
    remaining -= 1;
  }
  return raw
    .map((r, i) => ({
      archetype: r.archetype,
      count: counts[i]!,
      needs: freshNeeds(),
      needTotals: zeroNeeds(),
    }))
    .filter((g) => g.count > 0);
}

export function startCruise(tick: number, homePortId: string, guests: number): CruiseState {
  return {
    startedAtTick: tick,
    homePortId,
    guests,
    groups: buildGroups(guests),
    portsVisited: [homePortId],
    ticks: 0,
    fare: 0,
  };
}

/** Venue capacity per need from the placed modules; rest = cabin berths. */
export function serviceCapacity(
  modules: { moduleId: string }[],
  modulesById: Map<string, ShipModule>,
): Record<NeedKind, number> {
  const cap = zeroNeeds();
  for (const placed of modules) {
    const module = modulesById.get(placed.moduleId);
    if (!module) continue;
    if (module.servesNeed) cap[module.servesNeed] += module.capacity;
    if (module.category === 'cabin') cap.rest += module.capacity;
  }
  return cap;
}

function isNight(tick: number): boolean {
  const h = tickToDate(tick).getUTCHours();
  return h >= NIGHT_HOURS.start || h < NIGHT_HOURS.end;
}

/**
 * One tick of needs decay + service replenishment for the active cohort.
 * Mutates the draft cruise. Novelty only moves through decay here; port
 * arrivals grant boosts via `grantNoveltyBoost`.
 */
export function stepNeeds(
  cruise: CruiseState,
  tick: number,
  capacity: Record<NeedKind, number>,
  crew: CrewMember[],
  rolesById: Map<string, CrewRole>,
): void {
  const night = isNight(tick);
  const quality: Record<string, number> = {
    food: serviceQuality('food', crew, rolesById),
    fun: serviceQuality('fun', crew, rolesById),
    rest: serviceQuality('rest', crew, rolesById),
  };
  for (const group of cruise.groups) {
    const weights = ARCHETYPE_NEED_WEIGHTS[group.archetype];
    for (const need of NEEDS) {
      let value = group.needs[need] - NEED_DECAY_PER_TICK[need] * weights[need];
      if (need !== 'novelty') {
        const coverage = Math.min(1, capacity[need] / Math.max(1, cruise.guests));
        // Rest replenishes at night in cabins; food/fun replenish around the clock.
        if (need !== 'rest' || night) {
          value += NEED_REGEN_PER_TICK[need] * coverage * quality[need]!;
        }
      }
      group.needs[need] = Math.max(0, Math.min(100, value));
      group.needTotals[need] += group.needs[need];
    }
  }
  cruise.ticks += 1;
}

/** First call per port per cruise bumps novelty; later calls are no-ops. */
export function grantNoveltyBoost(cruise: CruiseState, portId: string): boolean {
  if (cruise.portsVisited.includes(portId)) return false;
  cruise.portsVisited.push(portId);
  for (const group of cruise.groups) {
    const boosted = group.needs.novelty + NOVELTY_PORT_BOOST;
    group.needs.novelty = Math.min(100, boosted);
  }
  return true;
}

/** §4.2: per-group weighted satisfaction from cruise-average needs, 0–100. */
export function groupSatisfaction(group: PassengerGroup, ticks: number): number {
  const weights = ARCHETYPE_NEED_WEIGHTS[group.archetype];
  let weighted = 0;
  let weightSum = 0;
  for (const need of NEEDS) {
    const avg = ticks > 0 ? group.needTotals[need] / ticks : NEED_START;
    weighted += weights[need] * avg;
    weightSum += weights[need];
  }
  return weighted / weightSum;
}

/** §4.2: satisfaction → star rating, clamped 0.5–5.0, rounded to halves. */
export function satisfactionToStars(satisfaction: number): number {
  const raw = 0.5 + 4.5 * Math.pow(satisfaction / 100, 1.2);
  return Math.round(Math.max(0.5, Math.min(5, raw)) * 2) / 2;
}

export interface CruiseOutcome {
  satisfaction: number;
  stars: number;
  reputationAfter: number;
}

/** §4.2 + §4.3: settle a finished cruise and fold it into reputation. */
export function resolveCruise(cruise: CruiseState, state: GameState): CruiseOutcome {
  const totalGuests = Math.max(1, cruise.guests);
  const satisfaction = cruise.groups.reduce(
    (s, g) => s + groupSatisfaction(g, cruise.ticks) * (g.count / totalGuests),
    0,
  );
  const stars = satisfactionToStars(satisfaction);
  const reputationAfter =
    (1 - REPUTATION_SMOOTHING) * state.reputation + REPUTATION_SMOOTHING * stars;
  return { satisfaction, stars, reputationAfter };
}
