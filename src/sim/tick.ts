// The heart of the simulation: advance the world one tick (1 sim hour) at a time.
// Pure — no renderer, no DOM, no Math.random. (state, data) in → (state, events) out.

import type { GameState, LogEntry } from './types';
import type { Port, ShipModule, CrewRole, DiningTheme, Excursion, ShipEvent } from './data/schemas';
import type { SimEvent } from './events';
import {
  SHIP_SPEED_KNOTS,
  FUEL_COST_PER_NM,
  PORT_STAY_HOURS,
  PORT_FEE_BY_TIER,
  PORT_FEE_MULTIPLIER,
  TICK_HOURS,
  LOG_MAX_ENTRIES,
  FARE_PER_NIGHT,
  EVENT_HOUR,
  type Archetype,
} from './constants';
import { seaRoute } from './searoute';
import { nextPortId, summarizeRoute } from './route';
import { formatTickShort, tickToDate } from './time';
import { layoutStats } from './ship';
import { engineerFuelMultiplier, hasCaptain, stepCrewMorale, wagesPerTick } from './crew';
import { grantNoveltyBoost, resolveCruise, startCruise, stepNeeds } from './passengers';
import { effectiveCapacity, runEventProgram, runExcursions, themeUpkeepPerDay } from './activities';

/** Static content the sim needs every tick, bundled once. */
export interface SimData {
  portsById: Map<string, Port>;
  modulesById: Map<string, ShipModule>;
  crewRolesById: Map<string, CrewRole>;
  diningThemesById: Map<string, DiningTheme>;
  excursionsByPortId: Map<string, Excursion[]>;
  eventsById: Map<string, ShipEvent>;
}

export interface TickResult {
  state: GameState;
  events: SimEvent[];
}

function pushLog(log: LogEntry[], tick: number, message: string): void {
  log.push({ tick, message: `[${formatTickShort(tick)}] ${message}` });
  if (log.length > LOG_MAX_ENTRIES) log.splice(0, log.length - LOG_MAX_ENTRIES);
}

/** Advance the sim by `ticks` whole ticks. Never mutates the input state. */
export function advanceTicks(state: GameState, ticks: number, data: SimData): TickResult {
  const s: GameState = structuredClone(state);
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) stepOneTick(s, data, events);
  return { state: s, events };
}

function stepOneTick(s: GameState, data: SimData, events: SimEvent[]): void {
  s.tick += 1;

  // Continuous costs: module upkeep + theme upkeep + crew wages.
  const stats = layoutStats(s.ship.layout, data.modulesById);
  s.money -= stats.upkeepPerDay / 24;
  s.money -= themeUpkeepPerDay(s.ship.layout, data.diningThemesById) / 24;
  s.money -= wagesPerTick(s.crew);
  stepCrewMorale(s);

  // Guests aboard: needs decay and get served (theme- and archetype-aware).
  if (s.cruise) {
    const capacityFor = (archetype: Archetype) =>
      effectiveCapacity(s.ship.layout, data.modulesById, data.diningThemesById, archetype);
    stepNeeds(s.cruise, s.tick, capacityFor, s.crew, data.crewRolesById);

    // The evening program runs daily while guests are aboard.
    if (tickToDate(s.tick).getUTCHours() === EVENT_HOUR && s.eventProgram.length > 0) {
      const result = runEventProgram(
        s.cruise,
        s.eventProgram,
        data.eventsById,
        s.ship.layout,
        s.crew,
        data.crewRolesById,
      );
      s.money -= result.cost;
    }
  }

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

    // Seaworthiness gate: engine + bridge + a captain aboard.
    const missing = !stats.hasEngine
      ? 'no engine room'
      : !stats.hasBridge
        ? 'no bridge'
        : !hasCaptain(s.crew)
          ? 'no captain aboard'
          : null;
    if (missing) {
      pos.departAtTick = s.tick + 24;
      pushLog(s.log, s.tick, `Departure delayed — ${missing}. Next attempt tomorrow.`);
      return;
    }

    const from = data.portsById.get(pos.portId);
    const to = data.portsById.get(nextId);
    if (!from || !to) return; // stale route entry; wait for the player to fix it

    // Boarding: leaving the route's home port with no cohort starts a cruise.
    const homePortId = s.routePortIds[0];
    if (!s.cruise && pos.portId === homePortId && stats.passengerCapacity > 0) {
      const cruise = startCruise(s.tick, pos.portId, stats.passengerCapacity);
      let nights = 3;
      try {
        const summary = summarizeRoute(s.routePortIds, data.portsById, s.ship.shipClass);
        if (summary) nights = Math.max(1, Math.ceil(summary.totalDays));
      } catch {
        // unknown port in route; keep the fallback estimate
      }
      cruise.fare = cruise.guests * FARE_PER_NIGHT * nights;
      s.money += cruise.fare;
      s.cruise = cruise;
      pushLog(
        s.log,
        s.tick,
        `${cruise.guests} guests boarded for a ${nights}-night cruise — fares $${Math.round(cruise.fare).toLocaleString('en-US')}.`,
      );
    }

    const nmTotal = seaRoute(from, to).nm;
    s.ship.position = { kind: 'sailing', fromPortId: from.id, toPortId: to.id, nmDone: 0, nmTotal };
    pushLog(s.log, s.tick, `Departed ${from.name} for ${to.name} (${Math.round(nmTotal)} nm).`);
    events.push({
      type: 'ship:departed',
      payload: { tick: s.tick, fromPortId: from.id, toPortId: to.id, nmTotal },
    });
    return;
  }

  // Sailing: cover distance and burn fuel for the distance actually covered
  // this tick. A good engineer trims the fuel bill.
  const speed = SHIP_SPEED_KNOTS[s.ship.shipClass];
  const nmThisTick = Math.min(speed * TICK_HOURS, pos.nmTotal - pos.nmDone);
  pos.nmDone += nmThisTick;
  s.money -=
    nmThisTick *
    FUEL_COST_PER_NM[s.ship.shipClass] *
    engineerFuelMultiplier(s.crew, data.crewRolesById);

  if (pos.nmDone >= pos.nmTotal - 1e-9) {
    const port = data.portsById.get(pos.toPortId);
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

    if (s.cruise) {
      if (pos.toPortId === s.cruise.homePortId) {
        // Homecoming: settle the cruise.
        const outcome = resolveCruise(s.cruise, s);
        s.reputation = outcome.reputationAfter;
        s.lastCruiseStars = outcome.stars;
        pushLog(
          s.log,
          s.tick,
          `Cruise complete — ${outcome.stars.toFixed(1)}★ (${Math.round(outcome.satisfaction)}% satisfaction). Line reputation ${s.reputation.toFixed(2)}★.`,
        );
        events.push({
          type: 'cruise:completed',
          payload: { tick: s.tick, stars: outcome.stars, satisfaction: outcome.satisfaction },
        });
        s.cruise = null;
      } else {
        if (grantNoveltyBoost(s.cruise, pos.toPortId)) {
          pushLog(s.log, s.tick, `Guests explore ${portName} — novelty up.`);
        }
        // Shore excursions run on every port call away from home.
        const excursions = data.excursionsByPortId.get(pos.toPortId) ?? [];
        const call = runExcursions(s.cruise, excursions, s.crew, data.crewRolesById);
        if (call.participants > 0) {
          s.money += call.cut;
          pushLog(
            s.log,
            s.tick,
            `${call.participants} excursion bookings in ${portName} — our cut $${Math.round(call.cut).toLocaleString('en-US')}.`,
          );
        }
      }
    }
  }
}
