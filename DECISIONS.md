# DECISIONS.md

Unspecified calls made while building, newest first.

- **Sea routing is computed, not shipped as data**: rather than vendoring a marine-network
  dataset (e.g. Eurostat SeaRoute/MARNET), routes come from A* over a 0.5° water grid derived
  from the world-atlas land polygons we already bundle. Zero new data files, deterministic,
  testable in pure sim code. Sub-cell straits are hand-carved corridors (the same trick real
  marine networks use). Swap in a real lane dataset later if lanes should follow traffic.
- **Harbor approaches are below grid resolution**: within ~60 nm of a port the path may clip
  coastal cells. Accepted — pins sit on coastlines, and modeling harbor channels would need a
  much finer grid for no gameplay gain.
- **Touch UX: tap-to-preview, tap-again-to-add** (no hover on phones); the port card docks to
  the bottom of the screen; panels collapse via their headers, ship's log starts collapsed on
  small screens.

- **Routes repeat**: after the last port, the ship sails back to the first port and the loop
  continues while unpaused. The brief's "cruise ends → resolve" screen belongs to Phase 5
  economy; for Phase 1 a continuous loop demonstrates sailing best.
- **Port fees charged at 0× in Phase 1**: the constant and formula exist (GAME_RULES §3/§4.5)
  but only fuel drains money until revenue exists to offset it (Phase 5).
- **HUD is DOM, not Pixi, in Phase 1**: the brief allows "Pixi + DOM overlay"; with no 2D ship
  view yet, DOM is the whole UI. Pixi is installed and enters with the Phase 2 deck editor.
- **Continent shapes from `world-atlas` (110m)**: bundled at build time (static, no runtime
  fetch), drawn once onto a canvas texture with a stylized flat palette rather than shipping a
  hand-drawn map. Gives real, recognizable continents cheaply.
- **Great-circle legs may visually cross land** (e.g. Miami→Cozumel clips Cuba). Accepted for
  v0.1; logged in GAME_RULES open questions for later waypoint routing.
- **Northern Europe region** covers Baltic + Norway + Iceland; St. Petersburg omitted since
  cruise lines suspended calls there.
- **Sim epoch is 2030-01-01** — near-future date keeps port/attraction data plausible and
  avoids implying any specific present-day year.
- **Ship starts docked at the first route port**: choosing a "home port" is implicit — the
  first port added to the route is home. An explicit home-port picker can come with Phase 5
  demand modeling.
- **zustand vanilla store** (no React): the DOM UI is small; framework-free keeps the
  render/ui layers symmetric (both just subscribe).
