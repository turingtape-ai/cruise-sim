import type { ShipClass } from './constants';

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

export interface ShipState {
  name: string;
  shipClass: ShipClass;
  position: ShipPosition;
}

/** The one serializable object that fully describes a game in progress. */
export interface GameState {
  version: 1;
  /** Sim hours elapsed since EPOCH_ISO. */
  tick: number;
  speed: SpeedSetting;
  money: number;
  /** 0.5–5.0 stars; static until Phase 5. */
  reputation: number;
  /** Ordered port ids; a round trip that repeats. First entry is the home port. */
  routePortIds: string[];
  ship: ShipState;
  /** Newest entry last; capped at LOG_MAX_ENTRIES. */
  log: LogEntry[];
}
