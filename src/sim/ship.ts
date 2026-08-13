// Ship layout rules: the deck grid, module placement/removal, and layout stats.
// Pure functions over plain data — the Pixi deck editor only calls these.

import type { PlacedModule, ShipLayout } from './types';
import type { ShipModule } from './data/schemas';
import {
  DECK_ZONES,
  ELEVATOR_COLS,
  HULL_END_FRACTION,
  SHIP_GRID,
  type ShipClass,
} from './constants';

export type PlacementResult = { ok: true } | { ok: false; reason: string };

/** Cells covered by a module placed with its top edge on `deck` at column `x`. */
export function moduleCells(
  module: Pick<ShipModule, 'w' | 'h'>,
  deck: number,
  x: number,
): Array<{ deck: number; x: number }> {
  const cells: Array<{ deck: number; x: number }> = [];
  for (let d = deck; d < deck + module.h; d++) {
    for (let c = x; c < x + module.w; c++) cells.push({ deck: d, x: c });
  }
  return cells;
}

function occupancy(layout: ShipLayout, modulesById: Map<string, ShipModule>): Set<number> {
  const occupied = new Set<number>();
  for (const placed of layout.placed) {
    const module = modulesById.get(placed.moduleId);
    if (!module) continue;
    for (const cell of moduleCells(module, placed.deck, placed.x)) {
      occupied.add(cell.deck * layout.cols + cell.x);
    }
  }
  return occupied;
}

const ZONE_LABELS: Record<string, string> = {
  top: 'the top decks',
  cabins: 'the mid (cabin) decks',
  venues: 'the lower venue decks',
  service: 'the service decks below',
};

/** The bow sits at high x (drawn right), the stern at low x. */
function inHullEnd(layout: ShipLayout, cols: number[], end: 'forward' | 'aft'): boolean {
  const band = Math.floor(layout.cols * HULL_END_FRACTION);
  return end === 'forward'
    ? cols.every((c) => c >= layout.cols - band)
    : cols.every((c) => c < band);
}

export function canPlace(
  layout: ShipLayout,
  modulesById: Map<string, ShipModule>,
  module: ShipModule,
  deck: number,
  x: number,
): PlacementResult {
  if (deck < 0 || x < 0 || deck + module.h > layout.decks || x + module.w > layout.cols) {
    return { ok: false, reason: 'Outside the hull' };
  }

  const cells = moduleCells(module, deck, x);
  const columns = [...new Set(cells.map((c) => c.x))];

  // Elevator cores span every deck and are unbuildable.
  if (columns.some((c) => layout.elevatorCols.includes(c))) {
    return { ok: false, reason: 'Blocked by an elevator core' };
  }

  // Vertical zoning: every occupied deck must be in one of the module's bands.
  for (let d = deck; d < deck + module.h; d++) {
    const zone = layout.zones[d];
    if (zone && !module.zones.includes(zone)) {
      const wanted = module.zones.map((z) => ZONE_LABELS[z] ?? z).join(' or ');
      return { ok: false, reason: `${module.name} belongs on ${wanted}` };
    }
  }

  if (module.placement === 'top' && deck !== 0) {
    return { ok: false, reason: `${module.name} must be on the top deck` };
  }
  if (module.placement === 'bottom' && deck + module.h !== layout.decks) {
    return { ok: false, reason: `${module.name} must sit on the lowest deck` };
  }
  if (module.hullEnd && !inHullEnd(layout, columns, module.hullEnd)) {
    return {
      ok: false,
      reason: `${module.name} belongs ${module.hullEnd === 'forward' ? 'at the bow' : 'aft, by the stern'}`,
    };
  }

  // Window rules: oceanview/balcony cabins need hull windows, so they cannot
  // sit against an elevator core (interior structure). Balconies only on the
  // uppermost cabin deck, closest to the open air.
  if (module.view === 'oceanview' || module.view === 'balcony') {
    if (columns.some((c) => layout.elevatorCols.some((e) => Math.abs(e - c) === 1))) {
      return {
        ok: false,
        reason: `${module.name} needs hull windows — not against an elevator core`,
      };
    }
  }
  if (module.view === 'balcony') {
    const topCabinDeck = layout.zones.indexOf('cabins');
    if (topCabinDeck !== -1 && deck !== topCabinDeck) {
      return { ok: false, reason: `${module.name} goes on the highest cabin deck` };
    }
  }

  const occupied = occupancy(layout, modulesById);
  for (const cell of cells) {
    if (occupied.has(cell.deck * layout.cols + cell.x)) {
      return { ok: false, reason: 'Overlaps another room' };
    }
  }
  return { ok: true };
}

/** Returns the new layout, or null if the placement is invalid. */
export function placeModule(
  layout: ShipLayout,
  modulesById: Map<string, ShipModule>,
  module: ShipModule,
  deck: number,
  x: number,
): ShipLayout | null {
  if (!canPlace(layout, modulesById, module, deck, x).ok) return null;
  const placed: PlacedModule = { id: layout.nextId, moduleId: module.id, deck, x };
  return {
    ...layout,
    nextId: layout.nextId + 1,
    placed: [...layout.placed, placed],
  };
}

/** Returns the new layout plus what was removed, or null if the id is unknown. */
export function removeModule(
  layout: ShipLayout,
  placedId: number,
): { layout: ShipLayout; removed: PlacedModule } | null {
  const removed = layout.placed.find((p) => p.id === placedId);
  if (!removed) return null;
  return {
    layout: { ...layout, placed: layout.placed.filter((p) => p.id !== placedId) },
    removed,
  };
}

export interface LayoutStats {
  passengerCapacity: number;
  crewCapacity: number;
  upkeepPerDay: number;
  moduleCount: number;
  hasEngine: boolean;
  hasBridge: boolean;
}

export function layoutStats(layout: ShipLayout, modulesById: Map<string, ShipModule>): LayoutStats {
  const stats: LayoutStats = {
    passengerCapacity: 0,
    crewCapacity: 0,
    upkeepPerDay: 0,
    moduleCount: layout.placed.length,
    hasEngine: false,
    hasBridge: false,
  };
  for (const placed of layout.placed) {
    const module = modulesById.get(placed.moduleId);
    if (!module) continue;
    stats.upkeepPerDay += module.upkeepPerDay;
    if (module.category === 'cabin') stats.passengerCapacity += module.capacity;
    else if (module.category === 'crew') stats.crewCapacity += module.capacity;
    if (module.id === 'engine') stats.hasEngine = true;
    if (module.id === 'bridge') stats.hasBridge = true;
  }
  return stats;
}

/**
 * The commissioned starting ship, laid out like a real one: bridge top-forward,
 * Lido buffet on the top deck, cabins mid-ship, a bar on the venue decks, and
 * crew + engine below aft. Positions are known-good for the coastal 6×24 grid
 * with elevator cores at 5/12/19 (asserted by tests against the real catalog).
 */
export function starterLayout(shipClass: ShipClass = 'coastal'): ShipLayout {
  const { decks, cols } = SHIP_GRID[shipClass];
  const placed: PlacedModule[] = [
    { id: 1, moduleId: 'bridge', deck: 0, x: 20 },
    { id: 2, moduleId: 'buffet', deck: 0, x: 13 },
    { id: 3, moduleId: 'cabin-oceanview', deck: 1, x: 2 },
    { id: 4, moduleId: 'cabin-oceanview', deck: 1, x: 3 },
    { id: 5, moduleId: 'cabin-inside', deck: 2, x: 6 },
    { id: 6, moduleId: 'cabin-inside', deck: 2, x: 7 },
    { id: 7, moduleId: 'bar', deck: 3, x: 6 },
    { id: 8, moduleId: 'engine', deck: decks - 2, x: 1 },
    { id: 9, moduleId: 'crew-quarters', deck: decks - 1, x: 6 },
  ];
  return {
    decks,
    cols,
    zones: [...DECK_ZONES[shipClass]],
    elevatorCols: [...ELEVATOR_COLS[shipClass]],
    nextId: 10,
    placed,
  };
}

/** Module-id multiset of the v2 starter ship, used by the v2→v3 save migration. */
export const V2_STARTER_MODULE_COUNTS: Record<string, number> = {
  bridge: 1,
  buffet: 1,
  bar: 1,
  'cabin-oceanview': 2,
  'cabin-inside': 2,
  'crew-quarters': 1,
  engine: 1,
};
