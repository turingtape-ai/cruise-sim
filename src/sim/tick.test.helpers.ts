import type { CrewMember } from './types';

/** Daily wage bill for a crew list (helper shared by tick tests). */
export function crewCost(crew: CrewMember[]): number {
  return crew.reduce((s, c) => s + c.wagePerDay, 0);
}

import type { GameData } from './data/load';
import type { SimData } from './tick';

/** Full SimData bundle from loaded game data (shared by tick-level tests). */
export function simDataFrom(data: GameData): SimData {
  return {
    portsById: data.portsById,
    modulesById: data.modulesById,
    crewRolesById: data.crewRolesById,
    diningThemesById: data.diningThemesById,
    excursionsByPortId: data.excursionsByPortId,
    eventsById: data.eventsById,
  };
}
