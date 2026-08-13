// Single source of truth for every tunable number.
// MUST stay in sync with the table in GAME_RULES.md §3 — update both in the same commit.

export const TICK_HOURS = 1;
export const EPOCH_ISO = '2030-01-01T00:00:00Z';
export const TICKS_PER_REAL_SECOND = 1;
export const SPEED_MULTIPLIERS = [0, 1, 2, 4] as const;

export type ShipClass = 'coastal' | 'panamax' | 'grande';

export const SHIP_SPEED_KNOTS: Record<ShipClass, number> = {
  coastal: 18,
  panamax: 20,
  grande: 22,
};

export const FUEL_COST_PER_NM: Record<ShipClass, number> = {
  coastal: 18,
  panamax: 32,
  grande: 55,
};

export const PORT_STAY_HOURS = 10;

/** Deck-grid dimensions per ship class: stacked decks × cells along each deck. */
export const SHIP_GRID: Record<ShipClass, { decks: number; cols: number }> = {
  coastal: { decks: 6, cols: 24 },
  panamax: { decks: 8, cols: 32 },
  grande: { decks: 10, cols: 40 },
};

export type DeckZone = 'top' | 'cabins' | 'venues' | 'service';

/**
 * Vertical zoning per class, index 0 = TOP deck. Mirrors real deck plans:
 * Lido/open decks on top, accommodation mid-ship, entertainment/dining on the
 * lower passenger decks, crew and machinery below (GAME_RULES §4.1c).
 */
export const DECK_ZONES: Record<ShipClass, DeckZone[]> = {
  coastal: ['top', 'cabins', 'cabins', 'venues', 'venues', 'service'],
  panamax: ['top', 'top', 'cabins', 'cabins', 'cabins', 'venues', 'venues', 'service'],
  grande: [
    'top',
    'top',
    'cabins',
    'cabins',
    'cabins',
    'cabins',
    'venues',
    'venues',
    'service',
    'service',
  ],
};

/**
 * Elevator core columns (forward / midship / aft banks) per class. Cores span
 * every deck; no module may occupy these columns.
 */
export const ELEVATOR_COLS: Record<ShipClass, number[]> = {
  coastal: [5, 12, 19],
  panamax: [7, 16, 25],
  grande: [9, 20, 31],
};

/** Fraction of the hull length counted as the bow ("forward") or stern ("aft") band. */
export const HULL_END_FRACTION = 1 / 3;

/** Fraction of a module's cost refunded when it is sold/removed. */
export const MODULE_SELL_REFUND = 0.5;

/** Indexed by port sizeTier (1-4). Charged at PORT_FEE_MULTIPLIER until Phase 5. */
export const PORT_FEE_BY_TIER: Record<1 | 2 | 3 | 4, number> = {
  1: 500,
  2: 1200,
  3: 2500,
  4: 5000,
};
/** Phase 1: fees documented but not charged (no revenue side yet). See GAME_RULES §7. */
export const PORT_FEE_MULTIPLIER = 0;

export const STARTING_MONEY = 500_000;

export const EARTH_RADIUS_NM = 3440.065;

// Sea routing (water-grid A*; see src/sim/searoute.ts and GAME_RULES §4.1).
/** Ocean grid resolution in degrees; 0.5° keeps straits like Yucatán Channel open. */
export const SEA_GRID_DEG = 0.5;
/** How far (in cells) a coastal port may snap to the nearest water cell. */
export const SEA_SNAP_MAX_CELLS = 4;
/**
 * Sampling step when checking a smoothed segment stays on water. Must stay
 * below the narrowest cell width in playable latitudes (~13 nm at 64°N).
 */
export const SEA_LOS_SAMPLE_NM = 8;

export const LOG_MAX_ENTRIES = 100;

// ---- Phase 3+ constants: designed now (GAME_RULES §3/§4), consumed by later phases. ----

export type NeedKind = 'food' | 'fun' | 'rest' | 'novelty';

export const NEED_DECAY_PER_TICK: Record<NeedKind, number> = {
  food: 4,
  fun: 3,
  rest: 2,
  novelty: 1.5,
};

export type Archetype = 'families' | 'retirees' | 'party-groups' | 'luxury-seekers' | 'adventurers';

export const ARCHETYPE_NEED_WEIGHTS: Record<Archetype, Record<NeedKind, number>> = {
  families: { food: 1.2, fun: 1.3, rest: 0.9, novelty: 0.8 },
  retirees: { food: 1.1, fun: 0.8, rest: 1.4, novelty: 0.9 },
  'party-groups': { food: 0.9, fun: 1.6, rest: 0.6, novelty: 1.1 },
  'luxury-seekers': { food: 1.4, fun: 0.9, rest: 1.2, novelty: 1.0 },
  adventurers: { food: 0.9, fun: 1.0, rest: 0.7, novelty: 1.7 },
};

export const CREW_MORALE_DECAY_PER_SAILING_DAY = 1.5;
export const PRICE_ELASTICITY = -1.4;
export const REPUTATION_SMOOTHING = 0.2;

// ---- Phase 3 (live): crew, passengers, needs. GAME_RULES §4.2/§4.2b. ----

/** Base need replenishment per tick at full coverage and quality 1.0. */
export const NEED_REGEN_PER_TICK: Record<Exclude<NeedKind, 'novelty'>, number> = {
  food: 9,
  fun: 7,
  rest: 12,
};
/** Needs start here when a cohort boards. */
export const NEED_START = 80;
/** Novelty jump when the ship arrives at a port this cruise hasn't seen. */
export const NOVELTY_PORT_BOOST = 35;
/** Rest replenishes only during night hours [start, end) — wraps midnight. */
export const NIGHT_HOURS = { start: 22, end: 6 };
/** Service quality when no crew member covers a need ("self service"). */
export const SELF_SERVICE_QUALITY = 0.15;
/** Crew morale recovery per full Port Day (counterpart to the sailing decay). */
export const CREW_MORALE_RECOVERY_PER_PORT_DAY = 3;
/** Wage multiplier: wage = role base × (0.7 + skill × 0.15). */
export const WAGE_SKILL_FACTOR = { base: 0.7, perSkill: 0.15 };
/** Fuel saving from the best engineer aboard: 3% per skill point (max 15%). */
export const ENGINEER_FUEL_SAVING_PER_SKILL = 0.03;
/** Rotating hiring pool: candidates per week (1 week = 168 ticks). */
export const CANDIDATES_PER_WEEK = 6;
export const TICKS_PER_WEEK = 168;
/** New crew join at this morale. */
export const CREW_STARTING_MORALE = 85;

/** Cohort archetype mix (fractions of guests, largest-remainder rounded). */
export const ARCHETYPE_MIX: Record<Archetype, number> = {
  families: 0.3,
  retirees: 0.2,
  'party-groups': 0.2,
  'luxury-seekers': 0.15,
  adventurers: 0.15,
};

/**
 * Flat fare per guest per cruise night, collected at boarding.
 * PLACEHOLDER until Phase 5 replaces it with demand & price elasticity (§4.4).
 */
export const FARE_PER_NIGHT = 180;

// ---- Phase 4 (live): dining themes, excursions, events. GAME_RULES §4.2c. ----

/** Themed venue service multiplier: 1 + factor × appeal/10 (up to 1.5×). */
export const THEME_APPEAL_FACTOR = 0.5;
/** Extra per preferred-tag match between a venue/event/excursion and an archetype. */
export const TAG_MATCH_BONUS = 0.15;
/** At most this many tag matches count. */
export const TAG_MATCH_CAP = 2;

/** Tags each archetype gravitates toward (matched against content appeal tags). */
export const ARCHETYPE_PREFERRED_TAGS: Record<Archetype, string[]> = {
  families: ['family', 'variety', 'comfort', 'casual', 'outdoor'],
  retirees: ['quiet', 'culture', 'comfort', 'morning', 'scenic', 'historic'],
  'party-groups': ['party', 'night', 'tropical', 'casual', 'beach'],
  'luxury-seekers': ['luxury', 'date-night', 'quiet', 'food'],
  adventurers: ['adventurous', 'adventure', 'variety', 'culture', 'nature', 'active'],
};

/** Share of guests who join excursions before tag affinity and capacity caps. */
export const EXCURSION_PARTICIPATION_BASE = 0.6;
/** The line's share of excursion ticket revenue. */
export const EXCURSION_CUT = 0.2;
/** Need boosts for excursion participants (scaled by guide factor & affinity). */
export const EXCURSION_FUN_BOOST = 10;
export const EXCURSION_NOVELTY_BOOST = 15;
/** Guide factor bounds: 0.6 with no guide, up to ~1.4 with an elite one. */
export const GUIDE_FACTOR = { base: 0.6, perQuality: 0.5, qualityCap: 1.6 };

/** Scheduled events run at this sim hour (UTC) while a cruise is underway. */
export const EVENT_HOUR = 20;
/** Event boost factor from entertainer quality: base + factor × quality. */
export const EVENT_QUALITY_FACTOR = { base: 0.6, perQuality: 0.4, qualityCap: 1.6 };
