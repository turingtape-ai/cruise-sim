import type { Archetype, NeedKind, ShipClass } from './constants';

export interface CrewMember {
  id: number;
  name: string;
  roleId: string;
  /** 1–5. */
  skill: number;
  wagePerDay: number;
  /** 0–100; scales service quality. */
  morale: number;
}

export interface PassengerGroup {
  archetype: Archetype;
  count: number;
  /** Current need levels, 0–100. */
  needs: Record<NeedKind, number>;
  /** Sum of need levels over the cruise so far (for end-of-cruise averages). */
  needTotals: Record<NeedKind, number>;
}

export interface CruiseState {
  startedAtTick: number;
  homePortId: string;
  guests: number;
  groups: PassengerGroup[];
  /** Ports that already paid out their novelty boost this cruise. */
  portsVisited: string[];
  /** Ticks simulated with this cohort aboard (denominator for averages). */
  ticks: number;
  fare: number;
}

export type SpeedSetting = 0 | 1 | 2 | 4;

export interface LogEntry {
  tick: number;
  message: string;
}

export type ShipPosition =
  | {
      kind: 'docked';
      portId: string;
      /** Tick at which the ship departs for the next route stop; null = no active route. */
      departAtTick: number | null;
    }
  | {
      kind: 'sailing';
      fromPortId: string;
      toPortId: string;
      nmDone: number;
      nmTotal: number;
    };

export interface PlacedModule {
  /** Unique instance id within this layout. */
  id: number;
  moduleId: string;
  /** Deck row the module's top edge sits on; deck 0 is the TOP deck. */
  deck: number;
  /** Leftmost grid cell along the deck (0 = bow side). */
  x: number;
  /** Assigned dining theme (buffet/restaurant/bar modules only). */
  themeId?: string | null;
}

export interface ShipLayout {
  decks: number;
  cols: number;
  /** Zone band per deck, index 0 = top deck (see DECK_ZONES). */
  zones: import('./constants').DeckZone[];
  /** Elevator core columns spanning all decks; unbuildable. */
  elevatorCols: number[];
  nextId: number;
  placed: PlacedModule[];
}

export interface ShipState {
  name: string;
  shipClass: ShipClass;
  position: ShipPosition;
  layout: ShipLayout;
}

/** The one serializable object that fully describes a game in progress. */
export interface GameState {
  version: 5;
  /** Sim hours elapsed since EPOCH_ISO. */
  tick: number;
  speed: SpeedSetting;
  money: number;
  /** 0.5–5.0 stars; updated by cruise outcomes (EWMA, §4.3). */
  reputation: number;
  /** Seed for all deterministic sim randomness (candidates, cohorts). */
  rngSeed: number;
  crew: CrewMember[];
  crewNextId: number;
  /** Candidate-pool bookkeeping: which indices of the current week were hired. */
  hiredCandidates: { week: number; indices: number[] };
  /** Active cohort, or null between cruises. */
  cruise: CruiseState | null;
  lastCruiseStars: number | null;
  /** Enabled recurring onboard events (ids into /data/events.json). */
  eventProgram: string[];
  /** Ordered port ids; a round trip that repeats. First entry is the home port. */
  routePortIds: string[];
  ship: ShipState;
  /** Newest entry last; capped at LOG_MAX_ENTRIES. */
  log: LogEntry[];
}
