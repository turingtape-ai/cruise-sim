import { haversineNm } from './geo';
import type { Port } from './data/schemas';
import { PORT_STAY_HOURS, SHIP_SPEED_KNOTS, FUEL_COST_PER_NM, type ShipClass } from './constants';

export interface LegSummary {
  fromPortId: string;
  toPortId: string;
  nm: number;
}

export interface RouteSummary {
  legs: LegSummary[];
  totalNm: number;
  /** Sim hours for one full round trip: sailing time + a port stay at every stop. */
  totalHours: number;
  totalDays: number;
  fuelCost: number;
}

/**
 * Summarize a round-trip route (closing leg back to the first port included).
 * Returns null when the route has fewer than 2 ports.
 */
export function summarizeRoute(
  routePortIds: string[],
  portsById: Map<string, Port>,
  shipClass: ShipClass,
): RouteSummary | null {
  if (routePortIds.length < 2) return null;
  const legs: LegSummary[] = [];
  for (let i = 0; i < routePortIds.length; i++) {
    const fromId = routePortIds[i]!;
    const toId = routePortIds[(i + 1) % routePortIds.length]!;
    const from = portsById.get(fromId);
    const to = portsById.get(toId);
    if (!from || !to) throw new Error(`route references unknown port: ${fromId} → ${toId}`);
    legs.push({ fromPortId: fromId, toPortId: toId, nm: haversineNm(from, to) });
  }
  const totalNm = legs.reduce((s, l) => s + l.nm, 0);
  const sailingHours = totalNm / SHIP_SPEED_KNOTS[shipClass];
  const totalHours = sailingHours + routePortIds.length * PORT_STAY_HOURS;
  return {
    legs,
    totalNm,
    totalHours,
    totalDays: totalHours / 24,
    fuelCost: totalNm * FUEL_COST_PER_NM[shipClass],
  };
}

/** The port the ship should sail to after `currentPortId`, looping the route. */
export function nextPortId(routePortIds: string[], currentPortId: string): string | null {
  if (routePortIds.length < 2) return null;
  const i = routePortIds.indexOf(currentPortId);
  const next = i === -1 ? routePortIds[0]! : routePortIds[(i + 1) % routePortIds.length]!;
  return next === currentPortId ? null : next;
}
