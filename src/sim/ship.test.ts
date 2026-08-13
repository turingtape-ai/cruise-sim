import { describe, expect, it } from 'vitest';
import {
  canPlace,
  layoutStats,
  moduleCells,
  placeModule,
  removeModule,
  starterLayout,
} from './ship';
import { loadGameData } from './data/load';
import { deserialize, serialize } from './save';
import { createNewGame } from './state';
import { advanceTicks } from './tick';
import type { GameState } from './types';

const { portsById, modulesById } = loadGameData();
const mod = (id: string) => modulesById.get(id)!;

describe('starterLayout', () => {
  const layout = starterLayout('coastal');

  it('references only real modules and fits the grid without overlap', () => {
    const seen = new Set<number>();
    for (const placed of layout.placed) {
      const module = modulesById.get(placed.moduleId);
      expect(module, placed.moduleId).toBeDefined();
      for (const cell of moduleCells(module!, placed.deck, placed.x)) {
        expect(cell.deck).toBeGreaterThanOrEqual(0);
        expect(cell.deck).toBeLessThan(layout.decks);
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.x).toBeLessThan(layout.cols);
        const key = cell.deck * layout.cols + cell.x;
        expect(seen.has(key), `overlap at deck ${cell.deck}, x ${cell.x}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('respects top/bottom placement rules for every starter module', () => {
    for (const placed of layout.placed) {
      const module = mod(placed.moduleId);
      const without = { ...layout, placed: layout.placed.filter((p) => p.id !== placed.id) };
      expect(canPlace(without, modulesById, module, placed.deck, placed.x).ok).toBe(true);
    }
  });

  it('is seaworthy and houses guests and crew', () => {
    const stats = layoutStats(layout, modulesById);
    expect(stats.hasEngine).toBe(true);
    expect(stats.hasBridge).toBe(true);
    expect(stats.passengerCapacity).toBeGreaterThan(0);
    expect(stats.crewCapacity).toBeGreaterThan(0);
  });
});

describe('canPlace', () => {
  const layout = starterLayout('coastal');

  it('rejects out-of-bounds placements', () => {
    expect(canPlace(layout, modulesById, mod('cabin-inside'), -1, 0).ok).toBe(false);
    expect(canPlace(layout, modulesById, mod('cabin-inside'), 0, 24).ok).toBe(false);
    expect(canPlace(layout, modulesById, mod('theater'), 4, 0).ok).toBe(false); // h=2 off the keel
  });

  it('rejects overlaps with the reason', () => {
    const check = canPlace(layout, modulesById, mod('cabin-inside'), 1, 3); // buffet lives there
    expect(check).toEqual({ ok: false, reason: 'Overlaps another room' });
  });

  it('enforces top and bottom deck rules', () => {
    expect(canPlace(layout, modulesById, mod('pool'), 2, 12).ok).toBe(false);
    expect(canPlace(layout, modulesById, mod('pool'), 0, 12).ok).toBe(true);
    expect(canPlace(layout, modulesById, mod('engine'), 0, 12).ok).toBe(false);
    expect(canPlace(layout, modulesById, mod('engine'), 3, 12).ok).toBe(true); // decks 3+4 touch keel
  });
});

describe('place/remove round trip', () => {
  it('places, then removes, restoring occupancy', () => {
    const layout = starterLayout('coastal');
    const placed = placeModule(layout, modulesById, mod('gym'), 2, 12);
    expect(placed).not.toBeNull();
    expect(placed!.placed.length).toBe(layout.placed.length + 1);
    const newId = placed!.placed[placed!.placed.length - 1]!.id;
    const removed = removeModule(placed!, newId);
    expect(removed).not.toBeNull();
    expect(removed!.layout.placed.length).toBe(layout.placed.length);
    expect(canPlace(removed!.layout, modulesById, mod('gym'), 2, 12).ok).toBe(true);
  });

  it('returns null for invalid placements and unknown removals', () => {
    const layout = starterLayout('coastal');
    expect(placeModule(layout, modulesById, mod('gym'), 1, 3)).toBeNull();
    expect(removeModule(layout, 9999)).toBeNull();
  });
});

describe('upkeep', () => {
  it('drains money per tick even while docked', () => {
    const g = createNewGame();
    const perDay = layoutStats(g.ship.layout, modulesById).upkeepPerDay;
    const { state } = advanceTicks(g, 24, portsById, modulesById);
    expect(g.money - state.money).toBeCloseTo(perDay, 6);
  });
});

describe('save migration v1 → v2', () => {
  it('grants old saves the starter layout', () => {
    const modern = createNewGame();
    const legacy = JSON.parse(serialize(modern)) as Record<string, unknown>;
    legacy.version = 1;
    delete (legacy.ship as Record<string, unknown>).layout;
    const restored = deserialize(JSON.stringify(legacy));
    expect(restored).not.toBeNull();
    expect(restored!.version).toBe(2);
    expect(restored!.ship.layout.placed.length).toBeGreaterThan(0);
    expect(layoutStats(restored!.ship.layout, modulesById).hasEngine).toBe(true);
  });

  it('v2 saves round-trip untouched', () => {
    const g = createNewGame() as GameState;
    expect(deserialize(serialize(g))).toEqual(g);
  });
});
