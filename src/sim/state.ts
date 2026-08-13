import type { GameState } from './types';
import { STARTING_MONEY } from './constants';
import { starterLayout } from './ship';

export const DEFAULT_HOME_PORT_ID = 'miami';
export const DEFAULT_SHIP_NAME = 'MV Pioneer';

export function createNewGame(homePortId: string = DEFAULT_HOME_PORT_ID): GameState {
  return {
    version: 2,
    tick: 0,
    speed: 0,
    money: STARTING_MONEY,
    reputation: 3,
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
