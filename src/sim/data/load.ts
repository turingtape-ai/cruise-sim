import portsJson from '../../../data/ports.json';
import diningJson from '../../../data/dining.json';
import excursionsJson from '../../../data/excursions.json';
import modulesJson from '../../../data/modules.json';
import crewJson from '../../../data/crew.json';
import {
  PortsFileSchema,
  DiningFileSchema,
  ExcursionsFileSchema,
  ModulesFileSchema,
  CrewFileSchema,
} from './schemas';
import type { Port, Dining, Excursion, ShipModule, CrewData, CrewRole } from './schemas';

export interface GameData {
  ports: Port[];
  portsById: Map<string, Port>;
  dining: Dining;
  excursions: Excursion[];
  excursionsByPortId: Map<string, Excursion[]>;
  modules: ShipModule[];
  modulesById: Map<string, ShipModule>;
  crewData: CrewData;
  crewRolesById: Map<string, CrewRole>;
}

/**
 * Validate and index the static content. Throws with a readable message if any
 * data file is malformed or cross-references are broken.
 */
export function loadGameData(): GameData {
  const ports = PortsFileSchema.parse(portsJson);
  const dining = DiningFileSchema.parse(diningJson);
  const excursions = ExcursionsFileSchema.parse(excursionsJson);
  const modules = ModulesFileSchema.parse(modulesJson);

  const portsById = new Map(ports.map((p) => [p.id, p]));
  if (portsById.size !== ports.length) throw new Error('ports.json: duplicate port ids');

  const excursionIds = new Set(excursions.map((e) => e.id));
  if (excursionIds.size !== excursions.length)
    throw new Error('excursions.json: duplicate excursion ids');

  const excursionsByPortId = new Map<string, Excursion[]>();
  for (const e of excursions) {
    if (!portsById.has(e.portId))
      throw new Error(`excursions.json: "${e.id}" references unknown port "${e.portId}"`);
    const list = excursionsByPortId.get(e.portId) ?? [];
    list.push(e);
    excursionsByPortId.set(e.portId, list);
  }

  const diningIds = [
    ...dining.buffets.map((d) => d.id),
    ...dining.restaurants.map((d) => d.id),
    ...dining.bars.map((d) => d.id),
  ];
  if (new Set(diningIds).size !== diningIds.length)
    throw new Error('dining.json: duplicate venue ids');

  const modulesById = new Map(modules.map((m) => [m.id, m]));
  if (modulesById.size !== modules.length) throw new Error('modules.json: duplicate module ids');

  const crewData = CrewFileSchema.parse(crewJson);
  const crewRolesById = new Map(crewData.roles.map((r) => [r.id, r]));
  if (crewRolesById.size !== crewData.roles.length)
    throw new Error('crew.json: duplicate role ids');

  return {
    ports,
    portsById,
    dining,
    excursions,
    excursionsByPortId,
    modules,
    modulesById,
    crewData,
    crewRolesById,
  };
}
