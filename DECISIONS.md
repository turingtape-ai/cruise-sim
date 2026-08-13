# DECISIONS.md

Unspecified calls made while building, newest first.

- **Passengers are cohorts, not agents**: archetype groups with averaged need meters. Cheap,
  serializable, and enough signal for satisfaction/reputation; individual agents walking the
  corridors can come later if Phase 4+ needs them.
- **A placeholder flat fare** (`FARE_PER_NIGHT` at boarding) ships with Phase 3 so cruises
  earn money before Phase 5's demand model — otherwise wages+fuel made the loop a pure drain.
  Documented as a placeholder in GAME_RULES §3/§4.5.
- **Deterministic hiring pool**: candidates derive from (save seed, week number) — no RNG
  state to persist, same pool on every reload, rotates weekly. The sim never calls
  Math.random; the store seeds new games.
- **Seaworthiness gate is live**: departure needs engine + bridge + captain, retrying daily
  with a log entry. The v3 "no gate yet" decision is superseded.
- **Cohort archetype mix is fixed** (30/20/20/15/15) rather than seeded-random or
  region-driven; regional/seasonal mixes belong with Phase 5 demand.
- **Excursion guides** serve the novelty need in name only until Phase 4 wires excursions;
  hiring one today does nothing beyond wages (the role exists so pools look right).

- **Deck zoning abstracts real ship architecture** (researched against published cruise deck
  plans — venues low, cabins mid, Lido high, bridge forward, engine aft, elevator banks
  fore/mid/aft): implemented as per-deck zone bands + reserved elevator-core columns +
  bow/stern bands, not as a freeform copy of any one ship. GameState bumped to v3; v2 saves
  are refitted to the fresh starter and **player-bought rooms refunded at full cost** (the
  rules changed, not the player's judgment).
- **Side-view stand-in for inside vs. window cabins**: the cutaway can't show
  port/starboard, so cells adjacent to an elevator core count as "interior" — oceanview and
  balcony cabins are barred from them, and balconies must take the top cabin deck. Twin
  corridor lines on cabin decks are visual until Phase 3 makes circulation functional.
- **Grid grew to 6 decks (coastal)** so the venue band can host the 2-deck theater and the
  service band stays distinct.

- **Deck 0 is the TOP deck** in layout coordinates, matching how the cutaway reads visually.
  `placement: "top"` means deck 0; `"bottom"` means the module's lowest row touches the keel.
- **The starter ship is free**: new games (and migrated v1 saves) begin with a commissioned
  layout (bridge, engine, crew quarters, buffet, bar, 4 cabins) at no cost — the brief's
  "buy/outfit a ship" purchase flow belongs with the Phase 5 economy.
- **Upkeep accrues continuously** (docked or sailing) rather than per Port Day — simpler, and
  it makes over-building hurt immediately. Sell refund is 50%.
- **Physical rooms vs. themes**: `modules.json` describes physical rooms; `dining.json`
  venues become _assignable themes_ for restaurant/bar/buffet modules in Phase 4.
- **No seaworthiness gate yet**: selling the engine doesn't stop the ship until Phase 3+
  systems land; `layoutStats.hasEngine/hasBridge` exists for that hookup.

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
