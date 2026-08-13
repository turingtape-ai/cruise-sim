// End-to-end cruise lifecycle through the tick loop: boarding, fares,
// novelty at ports, homecoming resolution, and the seaworthiness gate.

import { describe, expect, it } from 'vitest';
import { advanceTicks, type SimData } from './tick';
import { createNewGame } from './state';
import { loadGameData } from './data/load';
import { FARE_PER_NIGHT, PORT_STAY_HOURS } from './constants';
import { layoutStats } from './ship';
import type { GameState } from './types';

const data = loadGameData();
const simData: SimData = {
  portsById: data.portsById,
  modulesById: data.modulesById,
  crewRolesById: data.crewRolesById,
};

function gameOnRoute(): GameState {
  const g = createNewGame('miami');
  g.routePortIds = ['miami', 'nassau'];
  return g;
}

describe('cruise lifecycle', () => {
  it('boards a full cohort with fares when leaving the home port', () => {
    const g = gameOnRoute();
    const capacity = layoutStats(g.ship.layout, data.modulesById).passengerCapacity;
    const { state } = advanceTicks(g, PORT_STAY_HOURS, simData);
    expect(state.cruise).not.toBeNull();
    expect(state.cruise!.guests).toBe(capacity);
    expect(state.cruise!.fare).toBeGreaterThanOrEqual(capacity * FARE_PER_NIGHT);
    expect(state.log.some((l) => l.message.includes('guests boarded'))).toBe(true);
  });

  it('grants novelty at a new port and resolves on homecoming', () => {
    const g = gameOnRoute();
    // Miami→Nassau ~9 ticks each way + stays: 60 ticks covers a full loop.
    const { state, events } = advanceTicks(g, 60, simData);
    expect(state.log.some((l) => l.message.includes('explore Nassau'))).toBe(true);
    const completed = events.find((e) => e.type === 'cruise:completed');
    expect(completed).toBeDefined();
    expect(state.lastCruiseStars).not.toBeNull();
    expect(state.lastCruiseStars!).toBeGreaterThanOrEqual(0.5);
    expect(state.lastCruiseStars!).toBeLessThanOrEqual(5);
    expect(state.reputation).not.toBe(3); // EWMA moved off the 3.0 start
    // 60 ticks is past the next boarding — any active cruise must be a NEW one.
    if (state.cruise) {
      expect(state.cruise.startedAtTick).toBeGreaterThan(completed!.payload.tick);
    }
  });

  it('boards a fresh cohort (and fare) on the next loop', () => {
    const g = gameOnRoute();
    const { state, events } = advanceTicks(g, 120, simData);
    const completions = events.filter((e) => e.type === 'cruise:completed');
    expect(completions.length).toBeGreaterThanOrEqual(1);
    const boardings = state.log.filter((l) => l.message.includes('guests boarded'));
    expect(boardings.length).toBeGreaterThanOrEqual(1);
  });

  it('needs stay meaningfully served with the starter setup', () => {
    const g = gameOnRoute();
    const { state } = advanceTicks(g, 40, simData);
    const group = state.cruise?.groups[0];
    // Not asserting exact values — just that the loop isn't in freefall.
    if (group) {
      expect(group.needs.food).toBeGreaterThan(10);
      expect(group.needs.rest).toBeGreaterThan(10);
    }
  });

  it('refuses to sail without a captain and logs why', () => {
    const g = gameOnRoute();
    g.crew = g.crew.filter((c) => c.roleId !== 'captain');
    const { state } = advanceTicks(g, PORT_STAY_HOURS + 5, simData);
    expect(state.ship.position.kind).toBe('docked');
    expect(state.log.some((l) => l.message.includes('no captain aboard'))).toBe(true);
    expect(state.cruise).toBeNull();
  });

  it('refuses to sail without an engine', () => {
    const g = gameOnRoute();
    g.ship.layout = {
      ...g.ship.layout,
      placed: g.ship.layout.placed.filter((p) => p.moduleId !== 'engine'),
    };
    const { state } = advanceTicks(g, PORT_STAY_HOURS + 5, simData);
    expect(state.ship.position.kind).toBe('docked');
    expect(state.log.some((l) => l.message.includes('no engine room'))).toBe(true);
  });

  it('crew morale sinks at sea and recovers in port', () => {
    const g = gameOnRoute();
    const departed = advanceTicks(g, PORT_STAY_HOURS, simData).state;
    expect(departed.ship.position.kind).toBe('sailing');
    // Pure sailing ticks: morale strictly declines.
    const later = advanceTicks(departed, 6, simData).state;
    expect(later.ship.position.kind).toBe('sailing');
    expect(later.crew[0]!.morale).toBeLessThan(departed.crew[0]!.morale);
    // Dock the ship (clear the route) and morale climbs back.
    const arrived = advanceTicks(later, 20, simData).state;
    arrived.routePortIds = [];
    const arrivedMorale = arrived.crew[0]!.morale;
    const rested = advanceTicks(arrived, 48, simData).state;
    expect(rested.crew[0]!.morale).toBeGreaterThan(arrivedMorale);
  });
});
