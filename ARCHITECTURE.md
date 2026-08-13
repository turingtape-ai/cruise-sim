# ARCHITECTURE.md — Harbor & Horizon

## Layering (non-negotiable)

```
/src/sim     Pure TypeScript simulation. NO imports from three, pixi.js, or the DOM.
/src/render  Rendering only: Three.js globe scene, (Phase 2+) Pixi ship view.
/src/ui      DOM overlay: HUD, panels, hover cards.
/src/store.ts  Zustand vanilla store — the only bridge between layers.
/data        Static JSON content, validated with zod at load. No live API calls.
```

- `src/sim` is where all game rules live, as pure functions over plain data. It is the only
  layer with unit tests (Vitest). An ESLint `no-restricted-imports` rule enforces that it never
  imports a renderer.
- `src/render` and `src/ui` subscribe to the store and draw; they never mutate `GameState`
  directly — they call store actions.
- Rendering is not unit-tested.

## State

One serializable `GameState` object (see `src/sim/types.ts`) held in a Zustand **vanilla** store
(`src/store.ts` — no React in this project). Save/load is `JSON.stringify`/`parse` of that one
object to `localStorage` (`src/sim/save.ts` handles versioned serialization; the store handles
the storage side effect). `GameState.version` gates future migrations.

## Time

- 1 tick = 1 sim hour (`TICK_HOURS`). The main loop (`src/main.ts`) accumulates real ms via
  `requestAnimationFrame` and calls `store.advance(nTicks)` at `TICKS_PER_REAL_SECOND × speed`.
- `advance` applies `src/sim/tick.ts#advanceTicks`, a pure function
  `(state, ticks, ports) → state`, one tick at a time so no event can be skipped.
- Rendering interpolates between ticks (the ship dot lerps along its leg using fractional
  progress) so movement is smooth even though the sim is discrete.

## Simulation model (Phase 1 scope)

- `Route` = ordered port ids; legs are great-circle segments (haversine, `src/sim/geo.ts`).
- The ship is a state machine: `docked(portId, untilTick)` ⇄ `sailing(legIndex, nmDone)`.
  Fuel cost accrues per sailing tick. Arrivals/departures append to a capped log.
- Routes are round trips and repeat until paused or edited.

## Events

`src/sim/events.ts` defines a tiny typed event bus plus the `Incident` interface (storm,
norovirus, engine-failure, medical) as design stubs. Phase 6 will publish Incidents through this
bus; sim systems subscribe. Nothing emits them yet — but tick processing already routes through
the bus so wiring won't change.

## Rendering

- **Globe (Three.js, `src/render/globe/`)**: one sphere with a canvas texture generated at
  startup from `world-atlas` land polygons (equirectangular projection, flat-shaded stylized
  palette). Port pins are small cone meshes on the sphere surface; picking via raycaster.
  Route arcs are lifted great-circle lines; the ship is a billboard dot slerped along the
  active leg. OrbitControls for spin/zoom with damping.
- **Ship interior (PixiJS v8)**: arrives in Phase 2 (deck editor). Pixi is already a dependency
  so the toolchain is settled.
- **UI (DOM)**: HUD and cards are plain DOM in `src/ui/` styled by `src/style.css`. Phase 2+ may
  mix in Pixi-rendered UI inside the ship view.

## Data flow

```
data/*.json ──zod──▶ loadGameData() ──▶ store (static content, not in GameState)
user input ──▶ ui/render handlers ──▶ store actions ──▶ sim pure fns ──▶ new GameState
GameState changes ──subscribe──▶ render (globe) + ui (HUD) redraw
```

Static content (ports, dining, excursions) is **not** part of `GameState` — saves reference
content by id, so data files can grow without breaking saves.

## Build & deploy

Vite static build (`base: './'`), GitHub Actions workflow lint → test → build, deploying `dist/`
to GitHub Pages on pushes to `main`.
