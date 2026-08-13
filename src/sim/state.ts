import type { CrewMember, GameState } from './types';
import { CREW_STARTING_MORALE, STARTING_MONEY } from './constants';
import { starterLayout } from './ship';

export const DEFAULT_HOME_PORT_ID = 'miami';
export const DEFAULT_SHIP_NAME = 'MV Pioneer';

/** The commissioned crew: enough to sail and provide basic service. */
export function starterCrew(): CrewMember[] {
  const morale = CREW_STARTING_MORALE;
  return [
    { id: 1, name: 'Ingrid Halvorsen', roleId: 'captain', skill: 3, wagePerDay: 690, morale },
    { id: 2, name: 'Luca Marino', roleId: 'chef', skill: 2, wagePerDay: 260, morale },
    { id: 3, name: 'Rosa Santos', roleId: 'housekeeping', skill: 2, wagePerDay: 150, morale },
    { id: 4, name: 'Owen Quinn', roleId: 'entertainer', skill: 2, wagePerDay: 200, morale },
  ];
}

export function createNewGame(
  homePortId: string = DEFAULT_HOME_PORT_ID,
  rngSeed: number = 1,
): GameState {
  return {
    version: 5,
    tick: 0,
    speed: 0,
    money: STARTING_MONEY,
    reputation: 3,
    rngSeed,
    crew: starterCrew(),
    crewNextId: 5,
    hiredCandidates: { week: 0, indices: [] },
    cruise: null,
    lastCruiseStars: null,
    eventProgram: [],
    routePortIds: [],
    ship: {
      name: DEFAULT_SHIP_NAME,
      shipClass: 'coastal',
      position: { kind: 'docked', portId: homePortId, departAtTick: null },
      layout: starterLayout('coastal'),
    },
    log: [{ tick: 0, message: `${DEFAULT_SHIP_NAME} commissioned. Welcome aboard, Captain.` }],
  };
}
