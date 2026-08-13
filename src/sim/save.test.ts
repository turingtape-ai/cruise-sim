import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from './save';
import { createNewGame } from './state';

describe('save round-trip', () => {
  it('serializes and restores an identical GameState', () => {
    const g = createNewGame();
    g.routePortIds = ['miami', 'nassau'];
    g.money = 123_456;
    const restored = deserialize(serialize(g));
    expect(restored).toEqual(g);
  });

  it('rejects garbage input without throwing', () => {
    expect(deserialize('not json at all')).toBeNull();
    expect(deserialize('42')).toBeNull();
    expect(deserialize('null')).toBeNull();
  });

  it('rejects saves from unknown versions', () => {
    const g = createNewGame() as unknown as { version: number };
    g.version = 99;
    expect(deserialize(JSON.stringify(g))).toBeNull();
  });
});
