# Harbor & Horizon

A cozy-but-deep 2D cruise line management sim for the web (v0.1 — Phases 0–1).

Spin a stylized 3D globe dotted with ~40 real cruise ports, chain them into a route, press
play, and watch your ship sail it while the fuel bill ticks down.

## Run it

```sh
npm install
npm run dev      # dev server
npm test         # sim logic tests (Vitest)
npm run build    # typecheck + production build (dist/)
```

## Docs

- `GAME_RULES.md` — the design bible: glossary, constants, formulas, schemas, phase plan
- `ARCHITECTURE.md` — layering (pure sim vs render vs ui), state, time, data flow
- `DECISIONS.md` — judgment calls made along the way
- `CLAUDE.md` — working rules for AI sessions

## Controls

- Drag to spin the globe, scroll (or pinch) to zoom
- Hover a port pin for its card; click pins to build a route. On touch screens: tap a pin to
  preview it, tap again to add it
- Ships follow water-only sea routes (A* over an ocean grid) — no sailing across Cuba
- HUD: pause / 1× / 2× / 4× time, money, sim date, route panel, ship's log; panel headers
  collapse on tap
