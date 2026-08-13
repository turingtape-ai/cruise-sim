import { describe, expect, it } from 'vitest';
import { advanceTicks } from './tick';
import { createNewGame } from './state';
import { loadGameData } from './data/load';
import { haversineNm } from './geo';
import {
  FUEL_COST_PER_NM,
  PORT_STAY_HOURS,
  SHIP_SPEED_KNOTS,
  STARTING_MONEY,
} from './constants';
import type { GameState } from './types';

const { portsById } = loadGameData();

function gameWithRoute(portIds: string[]): GameState {
  const g = createNewGame(portIds[0]);
  g.routePortIds = [...portIds];
  return g;
}

describe('advanceTicks', () => {
  it('does not mutate the input state', () => {
    const g = gameWithRoute(['miami', 'nassau']);
    const frozen = JSON.stringify(g);
    advanceTicks(g, 50, portsById);
    expect(JSON.stringify(g)).toBe(frozen);
  });

  it('idles when there is no route', () => {
    const g = createNewGame();
    const { state, events } = advanceTicks(g, 24, portsById);
    expect(state.tick).toBe(24);
    expect(state.ship.position).toMatchObject({ kind: 'docked', portId: 'miami' });
    expect(state.money).toBe(STARTING_MONEY);
    expect(events).toHaveLength(0);
  });

  it('departs after a full port stay once a route is active', () => {
    const g = gameWithRoute(['miami', 'nassau']);
    const before = advanceTicks(g, PORT_STAY_HOURS - 1, portsById);
    expect(before.state.ship.position.kind).toBe('docked');
    const after = advanceTicks(g, PORT_STAY_HOURS, portsById);
    expect(after.state.ship.position.kind).toBe('sailing');
    expect(after.events[0]).toMatchObject({
      type: 'ship:departed',
      payload: { fromPortId: 'miami', toPortId: 'nassau' },
    });
  });

  it('burns fuel per nm actually sailed', () => {
    const g = gameWithRoute(['miami', 'nassau']);
    const speed = SHIP_SPEED_KNOTS.coastal;
    const { state } = advanceTicks(g, PORT_STAY_HOURS + 3, portsById);
    expect(state.ship.position).toMatchObject({ kind: 'sailing', nmDone: speed * 3 });
    expect(state.money).toBeCloseTo(STARTING_MONEY - speed * 3 * FUEL_COST_PER_NM.coastal, 6);
  });

  it('arrives, pays exactly the leg distance in fuel, and docks for the stay', () => {
    const g = gameWithRoute(['miami', 'nassau']);
    const nm = haversineNm(portsById.get('miami')!, portsById.get('nassau')!);
    const sailingTicks = Math.ceil(nm / SHIP_SPEED_KNOTS.coastal);
    const { state, events } = advanceTicks(g, PORT_STAY_HOURS + sailingTicks, portsById);
    expect(state.ship.position).toMatchObject({ kind: 'docked', portId: 'nassau' });
    expect(state.money).toBeCloseTo(STARTING_MONEY - nm * FUEL_COST_PER_NM.coastal, 6);
    expect(events.some((e) => e.type === 'ship:arrived')).toBe(true);
  });

  it('loops the route round-trip indefinitely', () => {
    const g = gameWithRoute(['miami', 'nassau']);
    // Two legs (~160 nm each ≈ 9 ticks) + stays; 100 ticks is over two full loops.
    const { state, events } = advanceTicks(g, 100, portsById);
    const arrivals = events.filter((e) => e.type === 'ship:arrived').map((e) => e.payload.portId);
    expect(arrivals.length).toBeGreaterThanOrEqual(3);
    expect(arrivals).toContain('miami');
    expect(arrivals).toContain('nassau');
    expect(state.log.length).toBeGreaterThan(3);
  });

  it('stays docked and clears departure when the route is emptied', () => {
    const g = gameWithRoute(['miami', 'nassau']);
    const sailing = advanceTicks(g, PORT_STAY_HOURS, portsById).state;
    expect(sailing.ship.position.kind).toBe('sailing');
    const arrivedThenCleared = advanceTicks(sailing, 20, portsById).state;
    arrivedThenCleared.routePortIds = [];
    const { state } = advanceTicks(arrivedThenCleared, 48, portsById);
    expect(state.ship.position.kind).toBe('docked');
    expect((state.ship.position as { departAtTick: number | null }).departAtTick).toBeNull();
  });

  it('keeps the log capped', () => {
    const g = gameWithRoute(['miami', 'nassau', 'cozumel', 'george-town']);
    const { state } = advanceTicks(g, 5000, portsById);
    expect(state.log.length).toBeLessThanOrEqual(100);
  });
});
