import { describe, expect, it } from 'vitest';
import { advanceTicks, type SimData } from './tick';
import { createNewGame } from './state';
import { loadGameData } from './data/load';
import { simDataFrom } from './tick.test.helpers';
import { seaRoute } from './searoute';
import { layoutStats } from './ship';
import { crewCost } from './tick.test.helpers';
import { FUEL_COST_PER_NM, PORT_STAY_HOURS, SHIP_SPEED_KNOTS, STARTING_MONEY } from './constants';
import type { GameState } from './types';

const data = loadGameData();
const simData: SimData = simDataFrom(data);

/**
 * Fixture tuned for exact fuel math: a zero-wage captain (so wages don't
 * drain money) and no cabins (so no cohort boards and no fare lands).
 * Upkeep still accrues; tests account for it via `drain`.
 */
function gameWithRoute(portIds: string[]): GameState {
  const g = createNewGame(portIds[0]);
  g.routePortIds = [...portIds];
  g.crew = [
    { id: 1, name: 'Test Captain', roleId: 'captain', skill: 3, wagePerDay: 0, morale: 100 },
  ];
  g.ship.layout = {
    ...g.ship.layout,
    placed: g.ship.layout.placed.filter((p) => !p.moduleId.startsWith('cabin')),
  };
  return g;
}

/** Fixed cost drain over `ticks`: module upkeep (+ wages, here zero). */
function drain(g: GameState, ticks: number): number {
  return (layoutStats(g.ship.layout, data.modulesById).upkeepPerDay / 24) * ticks;
}

describe('advanceTicks', () => {
  it('does not mutate the input state', () => {
    const g = gameWithRoute(['miami', 'nassau']);
    const frozen = JSON.stringify(g);
    advanceTicks(g, 50, simData);
    expect(JSON.stringify(g)).toBe(frozen);
  });

  it('idles when there is no route, draining only upkeep and wages', () => {
    const g = createNewGame();
    const { state, events } = advanceTicks(g, 24, simData);
    expect(state.tick).toBe(24);
    expect(state.ship.position).toMatchObject({ kind: 'docked', portId: 'miami' });
    const expected =
      STARTING_MONEY - layoutStats(g.ship.layout, data.modulesById).upkeepPerDay - crewCost(g.crew);
    expect(state.money).toBeCloseTo(expected, 6);
    expect(events).toHaveLength(0);
  });

  it('departs after a full port stay once a route is active', () => {
    const g = gameWithRoute(['miami', 'nassau']);
    const before = advanceTicks(g, PORT_STAY_HOURS - 1, simData);
    expect(before.state.ship.position.kind).toBe('docked');
    const after = advanceTicks(g, PORT_STAY_HOURS, simData);
    expect(after.state.ship.position.kind).toBe('sailing');
    expect(after.events[0]).toMatchObject({
      type: 'ship:departed',
      payload: { fromPortId: 'miami', toPortId: 'nassau' },
    });
  });

  it('burns fuel per nm actually sailed', () => {
    const g = gameWithRoute(['miami', 'nassau']);
    const speed = SHIP_SPEED_KNOTS.coastal;
    const ticks = PORT_STAY_HOURS + 3;
    const { state } = advanceTicks(g, ticks, simData);
    expect(state.ship.position).toMatchObject({ kind: 'sailing', nmDone: speed * 3 });
    const expected = STARTING_MONEY - drain(g, ticks) - speed * 3 * FUEL_COST_PER_NM.coastal;
    expect(state.money).toBeCloseTo(expected, 6);
  });

  it('arrives, pays exactly the leg distance in fuel, and docks for the stay', () => {
    const g = gameWithRoute(['miami', 'nassau']);
    const nm = seaRoute(data.portsById.get('miami')!, data.portsById.get('nassau')!).nm;
    const sailingTicks = Math.ceil(nm / SHIP_SPEED_KNOTS.coastal);
    const ticks = PORT_STAY_HOURS + sailingTicks;
    const { state, events } = advanceTicks(g, ticks, simData);
    expect(state.ship.position).toMatchObject({ kind: 'docked', portId: 'nassau' });
    const expected = STARTING_MONEY - drain(g, ticks) - nm * FUEL_COST_PER_NM.coastal;
    expect(state.money).toBeCloseTo(expected, 6);
    expect(events.some((e) => e.type === 'ship:arrived')).toBe(true);
  });

  it('loops the route round-trip indefinitely', () => {
    const g = gameWithRoute(['miami', 'nassau']);
    const { state, events } = advanceTicks(g, 100, simData);
    const arrivals = events.filter((e) => e.type === 'ship:arrived').map((e) => e.payload.portId);
    expect(arrivals.length).toBeGreaterThanOrEqual(3);
    expect(arrivals).toContain('miami');
    expect(arrivals).toContain('nassau');
    expect(state.log.length).toBeGreaterThan(3);
  });

  it('stays docked and clears departure when the route is emptied', () => {
    const g = gameWithRoute(['miami', 'nassau']);
    const sailing = advanceTicks(g, PORT_STAY_HOURS, simData).state;
    expect(sailing.ship.position.kind).toBe('sailing');
    const arrivedThenCleared = advanceTicks(sailing, 20, simData).state;
    arrivedThenCleared.routePortIds = [];
    const { state } = advanceTicks(arrivedThenCleared, 48, simData);
    expect(state.ship.position.kind).toBe('docked');
    expect((state.ship.position as { departAtTick: number | null }).departAtTick).toBeNull();
  });

  it('keeps the log capped', () => {
    const g = gameWithRoute(['miami', 'nassau', 'cozumel', 'george-town']);
    const { state } = advanceTicks(g, 5000, simData);
    expect(state.log.length).toBeLessThanOrEqual(100);
  });
});
