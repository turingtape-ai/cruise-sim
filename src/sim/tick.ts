// The heart of the simulation: advance the world one tick (1 sim hour) at a time.
// Pure — no renderer, no DOM, no randomness. (state, ports) in → (state, events) out.

import type { GameState, LogEntry } from './types';
import type { Port } from './data/schemas';
import type { SimEvent } from './events';
import {
  SHIP_SPEED_KNOTS,
  FUEL_COST_PER_NM,
  PORT_STAY_HOURS,
  PORT_FEE_BY_TIER,
  PORT_FEE_MULTIPLIER,
  TICK_HOURS,
  LOG_MAX_ENTRIES,
} from './constants';
import { seaRoute } from './searoute';
import { nextPortId } from './route';
import { formatTickShort } from './time';

export interface TickResult {
  state: GameState;
  events: SimEvent[];
}

function pushLog(log: LogEntry[], tick: number, message: string): void {
  log.push({ tick, message: `[${formatTickShort(tick)}] ${message}` });
  if (log.length > LOG_MAX_ENTRIES) log.splice(0, log.length - LOG_MAX_ENTRIES);
}

/** Advance the sim by `ticks` whole ticks. Never mutates the input state. */
export function advanceTicks(
  state: GameState,
  ticks: number,
  portsById: Map<string, Port>,
): TickResult {
  const s: GameState = structuredClone(state);
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) stepOneTick(s, portsById, events);
  return { state: s, events };
}

function stepOneTick(s: GameState, portsById: Map<string, Port>, events: SimEvent[]): void {
  s.tick += 1;
  const pos = s.ship.position;

  if (pos.kind === 'docked') {
    const nextId = nextPortId(s.routePortIds, pos.portId);
    if (nextId === null) {
      pos.departAtTick = null;
      return;
    }
    // A newly activated route departs after a port stay from "now".
    if (pos.departAtTick === null) pos.departAtTick = s.tick + PORT_STAY_HOURS - 1;
    if (s.tick < pos.departAtTick) return;

    const from = portsById.get(pos.portId);
    const to = portsById.get(nextId);
    if (!from || !to) return; // stale route entry; wait for the player to fix it
    const nmTotal = seaRoute(from, to).nm;
    s.ship.position = { kind: 'sailing', fromPortId: from.id, toPortId: to.id, nmDone: 0, nmTotal };
    pushLog(s.log, s.tick, `Departed ${from.name} for ${to.name} (${Math.round(nmTotal)} nm).`);
    events.push({
      type: 'ship:departed',
      payload: { tick: s.tick, fromPortId: from.id, toPortId: to.id, nmTotal },
    });
    return;
  }

  // Sailing: cover distance and burn fuel for the distance actually covered this tick.
  const speed = SHIP_SPEED_KNOTS[s.ship.shipClass];
  const nmThisTick = Math.min(speed * TICK_HOURS, pos.nmTotal - pos.nmDone);
  pos.nmDone += nmThisTick;
  s.money -= nmThisTick * FUEL_COST_PER_NM[s.ship.shipClass];

  if (pos.nmDone >= pos.nmTotal - 1e-9) {
    const port = portsById.get(pos.toPortId);
    const portName = port?.name ?? pos.toPortId;
    const fee = port ? PORT_FEE_BY_TIER[port.sizeTier] * PORT_FEE_MULTIPLIER : 0;
    s.money -= fee;
    s.ship.position = {
      kind: 'docked',
      portId: pos.toPortId,
      departAtTick: s.tick + PORT_STAY_HOURS,
    };
    pushLog(s.log, s.tick, `Arrived at ${portName}. In port for ${PORT_STAY_HOURS} hours.`);
    events.push({ type: 'ship:arrived', payload: { tick: s.tick, portId: pos.toPortId } });
  }
}
