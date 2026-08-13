// The single bridge between the pure sim and the render/ui layers.
// Zustand vanilla store: no React, subscribers are the renderers.

import { createStore } from 'zustand/vanilla';
import type { GameState, SpeedSetting } from './sim/types';
import type { GameData } from './sim/data/load';
import { createNewGame } from './sim/state';
import { advanceTicks } from './sim/tick';
import { EventBus } from './sim/events';
import { SAVE_KEY, deserialize, serialize } from './sim/save';

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
}

export function createGameStore(data: GameData, bus: EventBus) {
  const store = createStore<GameStore>()((set, get) => ({
    game: loadInitialGame(),

    advance(ticks) {
      if (ticks <= 0) return;
      const { state, events } = advanceTicks(get().game, ticks, data.portsById);
      set({ game: state });
      bus.emitAll(events);
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
