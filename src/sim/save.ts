// Versioned (de)serialization of GameState. Storage side effects live in the store,
// not here — this module stays pure so it can be unit tested.

import type { GameState, PlacedModule } from './types';
import { starterLayout, V2_STARTER_MODULE_COUNTS } from './ship';
import { starterCrew } from './state';
import { loadGameData, type GameData } from './data/load';
import type { ShipClass } from './constants';

export const SAVE_KEY = 'harbor-horizon-save';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Parse a save string; returns null (never throws) if it is unusable. */
export function deserialize(raw: string): GameState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const v = (parsed as { version?: unknown }).version;
    // Migrations chain: v1 → (starter layout) → v3 shape → v4.
    if (v === 1) return migrateV3toV4(grantStarterLayout(parsed as Record<string, unknown>));
    if (v === 2) return migrateV3toV4(migrateV2toV3(parsed as Record<string, unknown>));
    if (v === 3) return migrateV3toV4(parsed as unknown as GameState);
    if (v !== 4) return null; // future versions: migrate here
    return parsed as GameState;
  } catch {
    return null;
  }
}

let cachedData: GameData | null = null;
function data(): GameData {
  cachedData ??= loadGameData();
  return cachedData;
}

function shipClassOf(ship: Record<string, unknown>): ShipClass {
  return (ship.shipClass as ShipClass) ?? 'coastal';
}

function grantStarterLayout(old: Record<string, unknown>): GameState {
  const ship = old.ship as Record<string, unknown>;
  return {
    ...old,
    version: 3,
    ship: { ...ship, layout: starterLayout(shipClassOf(ship)) },
  } as unknown as GameState;
}

/** v3 predates crew & passengers: grant the starter crew and empty cruise state. */
function migrateV3toV4(old: GameState): GameState {
  const o = old as unknown as Record<string, unknown>;
  return {
    ...old,
    version: 4,
    rngSeed: (o.rngSeed as number) ?? 1,
    crew: starterCrew(),
    crewNextId: 5,
    hiredCandidates: { week: 0, indices: [] },
    cruise: null,
    lastCruiseStars: null,
  };
}

/**
 * v2 layouts predate deck zoning and elevator cores, so old placements can be
 * illegal under the new rules. The ship is refitted to the fresh starter
 * layout and every module the player bought beyond the v2 starter set is
 * refunded at FULL cost — the rules changed, not the player's judgment.
 */
function migrateV2toV3(old: Record<string, unknown>): GameState {
  const migrated = grantStarterLayout(old);
  const oldPlaced =
    ((old.ship as Record<string, unknown>).layout as { placed?: PlacedModule[] } | undefined)
      ?.placed ?? [];

  const remainingStarter = { ...V2_STARTER_MODULE_COUNTS };
  let refund = 0;
  for (const placed of oldPlaced) {
    if ((remainingStarter[placed.moduleId] ?? 0) > 0) {
      remainingStarter[placed.moduleId]! -= 1;
      continue;
    }
    refund += data().modulesById.get(placed.moduleId)?.cost ?? 0;
  }
  if (refund > 0) {
    migrated.money += refund;
    migrated.log = [
      ...migrated.log,
      {
        tick: migrated.tick,
        message: `Refit to the new deck plan code — $${Math.round(refund).toLocaleString('en-US')} in rooms refunded.`,
      },
    ];
  }
  return migrated;
}
