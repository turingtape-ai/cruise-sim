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
import type { GameState, PlacedModule } from './types';

const { portsById, modulesById, crewRolesById } = loadGameData();
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

  it('is legal under every placement rule (zones, cores, hull ends, views)', () => {
    for (const placed of layout.placed) {
      const module = mod(placed.moduleId);
      const without = { ...layout, placed: layout.placed.filter((p) => p.id !== placed.id) };
      const check = canPlace(without, modulesById, module, placed.deck, placed.x);
      expect(check, `${placed.moduleId}: ${!check.ok ? check.reason : ''}`).toEqual({ ok: true });
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

describe('canPlace — structural rules', () => {
  const layout = starterLayout('coastal');

  it('rejects out-of-bounds placements', () => {
    expect(canPlace(layout, modulesById, mod('cabin-inside'), -1, 0).ok).toBe(false);
    expect(canPlace(layout, modulesById, mod('cabin-inside'), 0, 24).ok).toBe(false);
    expect(canPlace(layout, modulesById, mod('theater'), 5, 0).ok).toBe(false); // h=2 off the keel
  });

  it('blocks elevator core columns on every deck', () => {
    for (const col of layout.elevatorCols) {
      const check = canPlace(layout, modulesById, mod('cabin-inside'), 2, col);
      expect(check).toEqual({ ok: false, reason: 'Blocked by an elevator core' });
    }
    // A wide module overlapping a core is blocked too.
    expect(canPlace(layout, modulesById, mod('casino'), 3, 11).ok).toBe(false);
  });

  it('rejects overlaps with the reason', () => {
    const check = canPlace(layout, modulesById, mod('cabin-inside'), 2, 6); // starter inside cabin
    expect(check).toEqual({ ok: false, reason: 'Overlaps another room' });
  });
});

describe('canPlace — deck zoning', () => {
  const layout = starterLayout('coastal');

  it('keeps venues off the cabin decks and vice versa', () => {
    const pool = canPlace(layout, modulesById, mod('pool'), 2, 8);
    expect(pool.ok).toBe(false);
    expect(!pool.ok && pool.reason).toContain('top decks');

    const casino = canPlace(layout, modulesById, mod('casino'), 0, 1);
    expect(casino.ok).toBe(false);
    expect(!casino.ok && casino.reason).toContain('lower venue decks');

    const cabin = canPlace(layout, modulesById, mod('cabin-inside'), 3, 9);
    expect(cabin.ok).toBe(false);
    expect(!cabin.ok && cabin.reason).toContain('mid (cabin) decks');
  });

  it('accepts modules in their own bands', () => {
    expect(canPlace(layout, modulesById, mod('pool'), 0, 6).ok).toBe(true);
    expect(canPlace(layout, modulesById, mod('casino'), 3, 13).ok).toBe(true);
    expect(canPlace(layout, modulesById, mod('theater'), 3, 13).ok).toBe(true); // spans venue decks 3+4
    expect(canPlace(layout, modulesById, mod('crew-quarters'), 5, 13).ok).toBe(true);
    expect(canPlace(layout, modulesById, mod('kids-club'), 0, 6).ok).toBe(true); // top or cabins
    expect(canPlace(layout, modulesById, mod('kids-club'), 1, 8).ok).toBe(true);
  });

  it('sends the bridge to the bow and the engine aft', () => {
    const sternBridge = canPlace(layout, modulesById, mod('bridge'), 0, 1);
    expect(sternBridge.ok).toBe(false);
    expect(!sternBridge.ok && sternBridge.reason).toContain('bow');
    expect(canPlace(layout, modulesById, mod('bridge'), 0, 16).ok).toBe(true);

    const withoutEngine = {
      ...layout,
      placed: layout.placed.filter((p) => p.moduleId !== 'engine'),
    };
    const bowEngine = canPlace(withoutEngine, modulesById, mod('engine'), 4, 13);
    expect(bowEngine.ok).toBe(false);
    expect(!bowEngine.ok && bowEngine.reason).toContain('aft');
    expect(canPlace(withoutEngine, modulesById, mod('engine'), 4, 1).ok).toBe(true);
  });
});

describe('canPlace — cabin window rules', () => {
  const layout = starterLayout('coastal');

  it('keeps oceanview cabins off elevator-core walls', () => {
    for (const x of [4, 6, 11, 13]) {
      const check = canPlace(layout, modulesById, mod('cabin-oceanview'), 1, x);
      expect(check.ok, `x=${x}`).toBe(false);
      expect(!check.ok && check.reason).toContain('hull windows');
    }
    expect(canPlace(layout, modulesById, mod('cabin-oceanview'), 1, 8).ok).toBe(true);
    // Inside cabins have no window and may hug the cores.
    expect(canPlace(layout, modulesById, mod('cabin-inside'), 1, 4).ok).toBe(true);
  });

  it('restricts balcony cabins to the highest cabin deck', () => {
    const low = canPlace(layout, modulesById, mod('cabin-balcony'), 2, 8);
    expect(low.ok).toBe(false);
    expect(!low.ok && low.reason).toContain('highest cabin deck');
    expect(canPlace(layout, modulesById, mod('cabin-balcony'), 1, 8).ok).toBe(true);
    expect(canPlace(layout, modulesById, mod('cabin-suite'), 1, 8).ok).toBe(true);
  });
});

describe('place/remove round trip', () => {
  it('places, then removes, restoring occupancy', () => {
    const layout = starterLayout('coastal');
    const placed = placeModule(layout, modulesById, mod('gym'), 0, 6);
    expect(placed).not.toBeNull();
    expect(placed!.placed.length).toBe(layout.placed.length + 1);
    const newId = placed!.placed[placed!.placed.length - 1]!.id;
    const removed = removeModule(placed!, newId);
    expect(removed).not.toBeNull();
    expect(removed!.layout.placed.length).toBe(layout.placed.length);
    expect(canPlace(removed!.layout, modulesById, mod('gym'), 0, 6).ok).toBe(true);
  });

  it('returns null for invalid placements and unknown removals', () => {
    const layout = starterLayout('coastal');
    expect(placeModule(layout, modulesById, mod('gym'), 2, 8)).toBeNull(); // wrong zone
    expect(removeModule(layout, 9999)).toBeNull();
  });
});

describe('upkeep', () => {
  it('drains money per tick even while docked', () => {
    const g = createNewGame();
    const perDay = layoutStats(g.ship.layout, modulesById).upkeepPerDay;
    const wages = g.crew.reduce((s, c) => s + c.wagePerDay, 0);
    const { state } = advanceTicks(g, 24, { portsById, modulesById, crewRolesById });
    expect(g.money - state.money).toBeCloseTo(perDay + wages, 6);
  });
});

describe('save migrations', () => {
  it('v1 saves get the current starter layout', () => {
    const modern = createNewGame();
    const legacy = JSON.parse(serialize(modern)) as Record<string, unknown>;
    legacy.version = 1;
    delete (legacy.ship as Record<string, unknown>).layout;
    const restored = deserialize(JSON.stringify(legacy));
    expect(restored).not.toBeNull();
    expect(restored!.version).toBe(4);
    expect(restored!.ship.layout.zones.length).toBe(restored!.ship.layout.decks);
    expect(layoutStats(restored!.ship.layout, modulesById).hasEngine).toBe(true);
  });

  it('v2 saves are refitted and player-bought rooms are refunded in full', () => {
    const modern = createNewGame();
    const v2 = JSON.parse(serialize(modern)) as Record<string, unknown>;
    v2.version = 2;
    // Reconstruct a v2-era layout: the old starter set plus a purchased casino
    // and pool, on the old 5×24 grid without zones/cores.
    const oldPlaced: PlacedModule[] = [
      { id: 1, moduleId: 'bridge', deck: 0, x: 0 },
      { id: 2, moduleId: 'buffet', deck: 1, x: 2 },
      { id: 3, moduleId: 'bar', deck: 1, x: 6 },
      { id: 4, moduleId: 'cabin-oceanview', deck: 2, x: 2 },
      { id: 5, moduleId: 'cabin-oceanview', deck: 2, x: 3 },
      { id: 6, moduleId: 'cabin-inside', deck: 3, x: 2 },
      { id: 7, moduleId: 'cabin-inside', deck: 3, x: 3 },
      { id: 8, moduleId: 'crew-quarters', deck: 3, x: 8 },
      { id: 9, moduleId: 'engine', deck: 3, x: 18 },
      { id: 10, moduleId: 'casino', deck: 1, x: 10 },
      { id: 11, moduleId: 'pool', deck: 0, x: 4 },
    ];
    (v2.ship as Record<string, unknown>).layout = {
      decks: 5,
      cols: 24,
      nextId: 12,
      placed: oldPlaced,
    };
    const restored = deserialize(JSON.stringify(v2));
    expect(restored).not.toBeNull();
    expect(restored!.version).toBe(4);
    const expectedRefund = mod('casino').cost + mod('pool').cost;
    expect(restored!.money - modern.money).toBe(expectedRefund);
    expect(restored!.ship.layout.elevatorCols.length).toBe(3);
    expect(restored!.log[restored!.log.length - 1]!.message).toContain('refunded');
  });

  it('v3 saves round-trip untouched', () => {
    const g = createNewGame() as GameState;
    expect(deserialize(serialize(g))).toEqual(g);
  });
});
