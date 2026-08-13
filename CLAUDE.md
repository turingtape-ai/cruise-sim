# CLAUDE.md — Harbor & Horizon

Read `GAME_RULES.md` before making ANY gameplay change. It is the design bible; every tunable
number and formula lives there.

## Tech stack (fixed — do not substitute)

- TypeScript + Vite, static site, no backend
- PixiJS v8 for all 2D rendering (ship interior, Phase 2+)
- Three.js ONLY for the globe scene
- Zustand (vanilla store) for state; one serializable `GameState`
- zod validates the static JSON in `/data`; Vitest for logic tests

## Hard rules

1. **sim/render separation**: `src/sim` is pure TS with zero imports from three/pixi/DOM.
   ESLint enforces this. Game rules go in `src/sim`; drawing goes in `src/render`/`src/ui`.
2. **Constants live in one place**: `src/sim/constants.ts`, mirrored by the table in
   `GAME_RULES.md` §3. Changing a number means updating both in the same commit.
3. Real-world content ships as static JSON in `/data`, schema-validated. Adding entries must
   never require code changes.
4. Pure sim logic gets Vitest coverage; rendering is not unit-tested.
5. Undocumented decisions go in `DECISIONS.md`.

## Current phase

**Phases 0 and 1 are complete** (foundations; globe + routes + sailing ship dot + HUD).
Next up: **Phase 2 — ship builder** (grid deck editor with room modules, in Pixi).
See the phase checklist in `GAME_RULES.md` §6.

## Commands

- `npm run dev` — dev server
- `npm test` — Vitest (sim logic)
- `npm run lint` / `npm run format` — ESLint / Prettier
- `npm run build` — typecheck + production build
