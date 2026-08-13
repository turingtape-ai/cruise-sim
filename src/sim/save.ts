// Versioned (de)serialization of GameState. Storage side effects live in the store,
// not here — this module stays pure so it can be unit tested.

import type { GameState } from './types';

export const SAVE_KEY = 'harbor-horizon-save';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Parse a save string; returns null (never throws) if it is unusable. */
export function deserialize(raw: string): GameState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const v = (parsed as { version?: unknown }).version;
    if (v !== 1) return null; // future versions: migrate here
    return parsed as GameState;
  } catch {
    return null;
  }
}
