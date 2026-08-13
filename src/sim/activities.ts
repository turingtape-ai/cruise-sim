// Phase 4 rules: dining themes, shore excursions, and scheduled events
// (GAME_RULES §4.2c). Pure functions; all effects flow through guest needs.

import type { CrewMember, CruiseState, ShipLayout } from './types';
import type { CrewRole, DiningTheme, Excursion, ShipEvent, ShipModule } from './data/schemas';
import {
  ARCHETYPE_PREFERRED_TAGS,
  EVENT_QUALITY_FACTOR,
  EXCURSION_CUT,
  EXCURSION_FUN_BOOST,
  EXCURSION_NOVELTY_BOOST,
  EXCURSION_PARTICIPATION_BASE,
  GUIDE_FACTOR,
  TAG_MATCH_BONUS,
  TAG_MATCH_CAP,
  THEME_APPEAL_FACTOR,
  type Archetype,
  type NeedKind,
} from './constants';
import { serviceQuality } from './crew';

/** 1 + TAG_MATCH_BONUS per preferred-tag match, capped. */
export function tagAffinity(tags: string[], archetype: Archetype): number {
  const preferred = ARCHETYPE_PREFERRED_TAGS[archetype];
  const matches = tags.filter((t) => preferred.includes(t)).length;
  return 1 + TAG_MATCH_BONUS * Math.min(TAG_MATCH_CAP, matches);
}

/** Themed venues serve better: 1 + THEME_APPEAL_FACTOR × appeal/10. */
export function themeMultiplier(theme: DiningTheme | undefined): number {
  return theme ? 1 + THEME_APPEAL_FACTOR * (theme.appeal / 10) : 1;
}

/**
 * Effective service capacity per need and archetype: venue capacity scaled by
 * theme appeal and the archetype's affinity for the theme's tags. Cabins add
 * plain rest capacity. Falls back to plain capacity for unthemed venues.
 */
export function effectiveCapacity(
  layout: ShipLayout,
  modulesById: Map<string, ShipModule>,
  themesById: Map<string, DiningTheme>,
  archetype: Archetype,
): Record<NeedKind, number> {
  const cap: Record<NeedKind, number> = { food: 0, fun: 0, rest: 0, novelty: 0 };
  for (const placed of layout.placed) {
    const module = modulesById.get(placed.moduleId);
    if (!module) continue;
    if (module.category === 'cabin') {
      cap.rest += module.capacity;
      continue;
    }
    if (!module.servesNeed) continue;
    const theme = placed.themeId ? themesById.get(placed.themeId) : undefined;
    const affinity = theme ? tagAffinity(theme.tags, archetype) : 1;
    cap[module.servesNeed] += module.capacity * themeMultiplier(theme) * affinity;
  }
  return cap;
}

/** Daily upkeep added by assigned themes (a themed venue costs its theme's rate). */
export function themeUpkeepPerDay(
  layout: ShipLayout,
  themesById: Map<string, DiningTheme>,
): number {
  let total = 0;
  for (const placed of layout.placed) {
    if (placed.themeId) total += themesById.get(placed.themeId)?.cost ?? 0;
  }
  return total;
}

/** A theme fits a module when the module id matches the theme's kind. */
export function themeFitsModule(theme: DiningTheme, moduleId: string): boolean {
  return theme.kind === moduleId;
}

export interface ExcursionCallResult {
  participants: number;
  cut: number;
}

/**
 * Shore excursions on a port call: every listed excursion runs; participation
 * per group = base share × tag affinity, capped by excursion capacity
 * (allocated proportionally). Participants get fun+novelty scaled by the best
 * excursion guide's quality; the line pockets EXCURSION_CUT of ticket sales.
 * Mutates the cruise's group needs.
 */
export function runExcursions(
  cruise: CruiseState,
  excursions: Excursion[],
  crew: CrewMember[],
  rolesById: Map<string, CrewRole>,
): ExcursionCallResult {
  if (excursions.length === 0 || cruise.guests === 0) return { participants: 0, cut: 0 };

  const guideQuality = Math.min(
    GUIDE_FACTOR.qualityCap,
    serviceQuality('novelty', crew, rolesById),
  );
  const guideFactor = GUIDE_FACTOR.base + GUIDE_FACTOR.perQuality * guideQuality;

  let totalParticipants = 0;
  let revenue = 0;

  for (const excursion of excursions) {
    // Interested guests per group, before the capacity cap.
    const interested = cruise.groups.map((g) => ({
      group: g,
      want: g.count * EXCURSION_PARTICIPATION_BASE * tagAffinity(excursion.appealTags, g.archetype),
    }));
    const totalWant = interested.reduce((s, i) => s + i.want, 0);
    if (totalWant <= 0) continue;
    const scale = Math.min(1, excursion.capacity / totalWant);

    for (const { group, want } of interested) {
      const joined = Math.min(group.count, want * scale);
      if (joined <= 0) continue;
      const share = joined / group.count;
      const boost = guideFactor * tagAffinity(excursion.appealTags, group.archetype);
      group.needs.fun = Math.min(100, group.needs.fun + EXCURSION_FUN_BOOST * share * boost);
      group.needs.novelty = Math.min(
        100,
        group.needs.novelty + EXCURSION_NOVELTY_BOOST * share * boost,
      );
      totalParticipants += joined;
      revenue += joined * excursion.pricePerGuest;
    }
  }

  return { participants: Math.round(totalParticipants), cut: revenue * EXCURSION_CUT };
}

export interface EventRunResult {
  ran: ShipEvent[];
  cost: number;
}

/**
 * Run the enabled evening program: each event fires if its venue module is
 * aboard, charging its cost and boosting guest needs scaled by entertainer
 * quality and per-archetype tag affinity. Mutates the cruise's group needs.
 */
export function runEventProgram(
  cruise: CruiseState,
  program: string[],
  eventsById: Map<string, ShipEvent>,
  layout: ShipLayout,
  crew: CrewMember[],
  rolesById: Map<string, CrewRole>,
): EventRunResult {
  const aboard = new Set(layout.placed.map((p) => p.moduleId));
  const quality = Math.min(EVENT_QUALITY_FACTOR.qualityCap, serviceQuality('fun', crew, rolesById));
  const qualityFactor = EVENT_QUALITY_FACTOR.base + EVENT_QUALITY_FACTOR.perQuality * quality;

  const ran: ShipEvent[] = [];
  let cost = 0;
  for (const id of program) {
    const event = eventsById.get(id);
    if (!event || !aboard.has(event.venue)) continue;
    ran.push(event);
    cost += event.costPerRun;
    for (const group of cruise.groups) {
      const affinity = tagAffinity(event.tags, group.archetype);
      for (const [need, delta] of Object.entries(event.boosts) as [NeedKind, number][]) {
        const scaled = delta > 0 ? delta * qualityFactor * affinity : delta;
        group.needs[need] = Math.max(0, Math.min(100, group.needs[need] + scaled));
      }
    }
  }
  return { ran, cost };
}
