// Ship layout rules: the deck grid, module placement/removal, and layout stats.
// Pure functions over plain data — the Pixi deck editor only calls these.

import type { PlacedModule, ShipLayout } from './types';
import type { ShipModule } from './data/schemas';
import { SHIP_GRID, type ShipClass } from './constants';

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
  if (module.placement === 'top' && deck !== 0) {
    return { ok: false, reason: `${module.name} must be on the top deck` };
  }
  if (module.placement === 'bottom' && deck + module.h !== layout.decks) {
    return { ok: false, reason: `${module.name} must sit on the lowest deck` };
  }
  const occupied = occupancy(layout, modulesById);
  for (const cell of moduleCells(module, deck, x)) {
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
 * The commissioned starting ship: bridge, engine, crew quarters, a buffet,
 * a bar, and four cabins. Positions are known-good for the coastal 5×24 grid
 * (asserted by tests against the real module catalog).
 */
export function starterLayout(shipClass: ShipClass = 'coastal'): ShipLayout {
  const { decks, cols } = SHIP_GRID[shipClass];
  const placed: PlacedModule[] = [
    { id: 1, moduleId: 'bridge', deck: 0, x: 0 },
    { id: 2, moduleId: 'buffet', deck: 1, x: 2 },
    { id: 3, moduleId: 'bar', deck: 1, x: 6 },
    { id: 4, moduleId: 'cabin-oceanview', deck: 2, x: 2 },
    { id: 5, moduleId: 'cabin-oceanview', deck: 2, x: 3 },
    { id: 6, moduleId: 'cabin-inside', deck: 3, x: 2 },
    { id: 7, moduleId: 'cabin-inside', deck: 3, x: 3 },
    { id: 8, moduleId: 'crew-quarters', deck: 3, x: 8 },
    { id: 9, moduleId: 'engine', deck: decks - 2, x: 18 },
  ];
  return { decks, cols, nextId: 10, placed };
}
