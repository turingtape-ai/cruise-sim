// The single bridge between the pure sim and the render/ui layers.
// Zustand vanilla store: no React, subscribers are the renderers.

import { createStore } from 'zustand/vanilla';
import type { GameState, SpeedSetting } from './sim/types';
import type { GameData } from './sim/data/load';
import { createNewGame } from './sim/state';
import { advanceTicks } from './sim/tick';
import { EventBus } from './sim/events';
import { SAVE_KEY, deserialize, serialize } from './sim/save';
import { canPlace, placeModule, removeModule } from './sim/ship';
import { MODULE_SELL_REFUND } from './sim/constants';

export interface GameStore {
  game: GameState;
  advance(ticks: number): void;
  setSpeed(speed: SpeedSetting): void;
  addPortToRoute(portId: string): void;
  removeRouteStop(index: number): void;
  clearRoute(): void;
  newGame(): void;
  save(): void;
  /** Returns true if a save existed and was loaded. */
  load(): boolean;
  /** Buy + place a module. Returns null on success, or a reason string. */
  buyModule(moduleId: string, deck: number, x: number): string | null;
  /** Sell a placed module for a partial refund. */
  sellModule(placedId: number): void;
}

export function createGameStore(data: GameData, bus: EventBus) {
  const store = createStore<GameStore>()((set, get) => ({
    game: loadInitialGame(),

    advance(ticks) {
      if (ticks <= 0) return;
      const { state, events } = advanceTicks(get().game, ticks, data.portsById, data.modulesById);
      set({ game: state });
      bus.emitAll(events);
    },

    buyModule(moduleId, deck, x) {
      const game = get().game;
      const module = data.modulesById.get(moduleId);
      if (!module) return 'Unknown module';
      if (game.money < module.cost) return 'Not enough money';
      const check = canPlace(game.ship.layout, data.modulesById, module, deck, x);
      if (!check.ok) return check.reason;
      const layout = placeModule(game.ship.layout, data.modulesById, module, deck, x);
      if (!layout) return 'Invalid placement';
      set({
        game: {
          ...game,
          money: game.money - module.cost,
          ship: { ...game.ship, layout },
        },
      });
      return null;
    },

    sellModule(placedId) {
      const game = get().game;
      const result = removeModule(game.ship.layout, placedId);
      if (!result) return;
      const module = data.modulesById.get(result.removed.moduleId);
      const refund = (module?.cost ?? 0) * MODULE_SELL_REFUND;
      set({
        game: {
          ...game,
          money: game.money + refund,
          ship: { ...game.ship, layout: result.layout },
        },
      });
    },

    setSpeed(speed) {
      set({ game: { ...get().game, speed } });
    },

    addPortToRoute(portId) {
      const game = get().game;
      const route = game.routePortIds;
      if (route[route.length - 1] === portId) return; // no zero-length legs
      const next: GameState = { ...game, routePortIds: [...route, portId] };
      // First stop chosen while idle in harbor = picking the home port.
      if (route.length === 0 && game.ship.position.kind === 'docked') {
        next.ship = {
          ...game.ship,
          position: { kind: 'docked', portId, departAtTick: null },
        };
      }
      set({ game: next });
    },

    removeRouteStop(index) {
      const game = get().game;
      const route = game.routePortIds.filter((_, i) => i !== index);
      set({ game: { ...game, routePortIds: route } });
    },

    clearRoute() {
      set({ game: { ...get().game, routePortIds: [] } });
    },

    newGame() {
      set({ game: createNewGame() });
      get().save();
    },

    save() {
      try {
        localStorage.setItem(SAVE_KEY, serialize(get().game));
      } catch {
        // Storage full or unavailable — a lost autosave is not fatal.
      }
    },

    load() {
      const restored = loadSavedGame();
      if (!restored) return false;
      set({ game: restored });
      return true;
    },
  }));
  return store;
}

export type GameStoreApi = ReturnType<typeof createGameStore>;

function loadSavedGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

function loadInitialGame(): GameState {
  const saved = loadSavedGame();
  if (saved) return { ...saved, speed: 0 }; // resume paused
  return createNewGame();
}
