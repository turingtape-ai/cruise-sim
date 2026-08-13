# DECISIONS.md

Unspecified calls made while building, newest first.

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
