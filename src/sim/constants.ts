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
