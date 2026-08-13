// The single bridge between the pure sim and the render/ui layers.
// Zustand vanilla store: no React, subscribers are the renderers.

import { createStore } from 'zustand/vanilla';
import type { GameState, SpeedSetting } from './sim/types';
import type { GameData } from './sim/data/load';
import { createNewGame } from './sim/state';
import { advanceTicks, type SimData } from './sim/tick';
import { candidatesForWeek, weekOfTick, type Candidate } from './sim/crew';
import { layoutStats } from './sim/ship';
import { CREW_STARTING_MORALE } from './sim/constants';
import { EventBus } from './sim/events';
import { SAVE_KEY, deserialize, serialize } from './sim/save';
import { canPlace, placeModule, removeModule } from './sim/ship';
import { themeFitsModule } from './sim/activities';
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
  /** Assign (or clear) a dining theme on a placed module. Null reason = ok. */
  assignTheme(placedId: number, themeId: string | null): string | null;
  /** Toggle an event in the recurring evening program. */
  toggleEvent(eventId: string): void;
  /** This week's hiring pool with already-hired slots marked. */
  candidates(): Array<Candidate & { hired: boolean }>;
  /** Hire candidate by pool index. Returns null on success, or a reason. */
  hire(index: number): string | null;
  dismiss(crewId: number): void;
}

export function createGameStore(data: GameData, bus: EventBus) {
  const simData: SimData = {
    portsById: data.portsById,
    modulesById: data.modulesById,
    crewRolesById: data.crewRolesById,
    diningThemesById: data.diningThemesById,
    excursionsByPortId: data.excursionsByPortId,
    eventsById: data.eventsById,
  };
  const store = createStore<GameStore>()((set, get) => ({
    game: loadInitialGame(),

    advance(ticks) {
      if (ticks <= 0) return;
      const { state, events } = advanceTicks(get().game, ticks, simData);
      set({ game: state });
      bus.emitAll(events);
    },

    assignTheme(placedId, themeId) {
      const game = get().game;
      const placed = game.ship.layout.placed.find((p) => p.id === placedId);
      if (!placed) return 'Unknown room';
      if (themeId !== null) {
        const theme = data.diningThemesById.get(themeId);
        if (!theme) return 'Unknown theme';
        if (!themeFitsModule(theme, placed.moduleId)) {
          return `That theme needs a ${theme.kind} room`;
        }
      }
      set({
        game: {
          ...game,
          ship: {
            ...game.ship,
            layout: {
              ...game.ship.layout,
              placed: game.ship.layout.placed.map((p) =>
                p.id === placedId ? { ...p, themeId } : p,
              ),
            },
          },
        },
      });
      return null;
    },

    toggleEvent(eventId) {
      const game = get().game;
      if (!data.eventsById.has(eventId)) return;
      const enabled = game.eventProgram.includes(eventId);
      set({
        game: {
          ...game,
          eventProgram: enabled
            ? game.eventProgram.filter((id) => id !== eventId)
            : [...game.eventProgram, eventId],
        },
      });
    },

    candidates() {
      const game = get().game;
      const week = weekOfTick(game.tick);
      const hired = game.hiredCandidates.week === week ? game.hiredCandidates.indices : [];
      return candidatesForWeek(game.rngSeed, week, data.crewData).map((c, i) => ({
        ...c,
        hired: hired.includes(i),
      }));
    },

    hire(index) {
      const game = get().game;
      const week = weekOfTick(game.tick);
      const pool = candidatesForWeek(game.rngSeed, week, data.crewData);
      const candidate = pool[index];
      if (!candidate) return 'Unknown candidate';
      const hired = game.hiredCandidates.week === week ? game.hiredCandidates.indices : [];
      if (hired.includes(index)) return 'Already hired';
      const berths = layoutStats(game.ship.layout, data.modulesById).crewCapacity;
      if (game.crew.length >= berths) return 'No free crew berths — build more crew quarters';
      set({
        game: {
          ...game,
          crew: [
            ...game.crew,
            {
              id: game.crewNextId,
              name: candidate.name,
              roleId: candidate.roleId,
              skill: candidate.skill,
              wagePerDay: candidate.wagePerDay,
              morale: CREW_STARTING_MORALE,
            },
          ],
          crewNextId: game.crewNextId + 1,
          hiredCandidates: { week, indices: [...hired, index] },
        },
      });
      return null;
    },

    dismiss(crewId) {
      const game = get().game;
      set({ game: { ...game, crew: game.crew.filter((c) => c.id !== crewId) } });
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
      // Seeding is a UI-side effect; the sim itself never calls Math.random.
      set({ game: createNewGame(undefined, Math.floor(Math.random() * 2 ** 31)) });
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
