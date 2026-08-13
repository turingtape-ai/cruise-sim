# GAME_RULES.md — Harbor & Horizon design bible

This is the living design document. Every number the player sees must trace back to a rule here.
Simulation constants live in `src/sim/constants.ts` and MUST match the table in §3 — any change
requires updating **both** places in the same commit.

---

## 1. Pillars

1. **Every number the player sees traces to a rule in this doc** — no magic numbers in code.
2. **Cozy on the surface, deep underneath** — the player can coast on defaults, but mastery of
   routes, crews, and menus is always rewarded.
3. **The world is real** — ports, attractions, and distances come from the actual planet, so
   planning a Mediterranean loop teaches you real geography.

## 2. Glossary

Canonical names. Use these exact terms in code, UI, and docs.

| Term            | Definition                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Port**        | A real-world cruise port on the globe. Has a location, size tier, and attractions.                                                                    |
| **Route**       | An ordered list of Ports the ship visits, starting from the home port. Routes are round trips: after the final Port the ship sails back to the first. |
| **Leg**         | The great-circle passage between two consecutive Ports on a Route.                                                                                    |
| **Cruise**      | One full traversal of a Route by a ship carrying one passenger cohort, from departure at the home port to return.                                     |
| **Sailing Day** | A sim day spent underway on a Leg. Burns fuel; passengers consume onboard services.                                                                   |
| **Port Day**    | A sim day (or part of one) docked at a Port. Passengers may take excursions; the ship restocks.                                                       |
| **Module**      | A room placed on a ship deck (cabin, buffet, bar, pool, …). Has footprint, cost, capacity, upkeep, appeal tags. _(Phase 2)_                           |
| **Archetype**   | A passenger category (families, retirees, party groups, luxury seekers, adventurers) with its own need weights and preferences. _(Phase 3)_           |
| **Need**        | A decaying meter on a passenger: `food`, `fun`, `rest`, `novelty`. Fulfilled by modules, events, and excursions. _(Phase 3)_                          |
| **Incident**    | An emergency (storm, outbreak, mechanical failure, medical). Interface defined now; behavior in Phase 6.                                              |
| **Tick**        | The atomic unit of sim time: **1 tick = 1 sim hour**.                                                                                                 |
| **Attraction**  | A real point of interest at a Port; excursions are built on attractions.                                                                              |
| **Excursion**   | A bookable shore activity at a Port, with price, duration, capacity, and appeal tags.                                                                 |

## 3. Simulation constants

Single source of truth for tunables. Mirror of `src/sim/constants.ts` — keep in sync.

| Constant                            | Value                    | Unit                      | Notes                                                                                                                           |
| ----------------------------------- | ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `TICK_HOURS`                        | 1                        | sim hours / tick          | Atomic sim step.                                                                                                                |
| `EPOCH_ISO`                         | 2030-01-01T00:00Z        | date                      | Sim date at tick 0.                                                                                                             |
| `TICKS_PER_REAL_SECOND`             | 1                        | ticks / real second at 1× | 2× and 4× multiply this.                                                                                                        |
| `SPEED_MULTIPLIERS`                 | 0, 1, 2, 4               | —                         | Pause, 1×, 2×, 4×.                                                                                                              |
| `SHIP_SPEED_KNOTS.coastal`          | 18                       | nm / sim hour             | Small starter class.                                                                                                            |
| `SHIP_SPEED_KNOTS.panamax`          | 20                       | nm / sim hour             | Mid class _(locked until Phase 5 reputation gates)_.                                                                            |
| `SHIP_SPEED_KNOTS.grande`           | 22                       | nm / sim hour             | Large class _(locked)_.                                                                                                         |
| `FUEL_COST_PER_NM.coastal`          | 18                       | $ / nm                    | See fuel formula §4.1.                                                                                                          |
| `FUEL_COST_PER_NM.panamax`          | 32                       | $ / nm                    |                                                                                                                                 |
| `FUEL_COST_PER_NM.grande`           | 55                       | $ / nm                    |                                                                                                                                 |
| `PORT_STAY_HOURS`                   | 10                       | sim hours                 | Default dock time per Port call.                                                                                                |
| `PORT_FEE_BY_TIER`                  | 500 / 1200 / 2500 / 5000 | $                         | Indexed by port size tier 1–4. Charged on arrival. _(Phase 5 — documented now, charged from Phase 1 at 0×; see Open Questions)_ |
| `STARTING_MONEY`                    | 500000                   | $                         | New game bankroll.                                                                                                              |
| `NEED_DECAY_PER_TICK.food`          | 4                        | pts / tick                | Needs are 0–100. _(Phase 3)_                                                                                                    |
| `NEED_DECAY_PER_TICK.fun`           | 3                        | pts / tick                | _(Phase 3)_                                                                                                                     |
| `NEED_DECAY_PER_TICK.rest`          | 2                        | pts / tick                | _(Phase 3)_                                                                                                                     |
| `NEED_DECAY_PER_TICK.novelty`       | 1.5                      | pts / tick                | _(Phase 3)_                                                                                                                     |
| `ARCHETYPE_NEED_WEIGHTS`            | see `constants.ts`       | —                         | Per-archetype multipliers on decay & scoring. _(Phase 3)_                                                                       |
| `CREW_MORALE_DECAY_PER_SAILING_DAY` | 1.5                      | pts / day                 | Morale 0–100. _(Phase 3)_                                                                                                       |
| `PRICE_ELASTICITY`                  | −1.4                     | —                         | Exponent in demand curve §4.4. _(Phase 5)_                                                                                      |
| `SATISFACTION_TO_STARS`             | see §4.2                 | —                         | Piecewise mapping. _(Phase 5)_                                                                                                  |
| `REPUTATION_SMOOTHING`              | 0.2                      | —                         | EWMA weight for new cruise outcomes §4.3. _(Phase 5)_                                                                           |

## 4. Formulas

Written in plain math. Implemented (or to be implemented) as pure functions in `src/sim/`.

### 4.1 Fuel cost (Phase 1 — live)

For a Leg of great-circle length `d` nautical miles sailed by ship class `c`:

```
fuelCost(d, c) = d × FUEL_COST_PER_NM[c]
```

Charged continuously while sailing: each tick underway costs
`SHIP_SPEED_KNOTS[c] × FUEL_COST_PER_NM[c]` dollars (distance covered that hour × unit cost).
Great-circle distance uses the haversine formula with Earth radius 3440.065 nm.

### 4.2 Satisfaction score (Phase 3/5 — designed)

Per passenger at cruise end, needs averaged over the cruise (`avgNeed ∈ [0,100]`):

```
satisfaction = Σ_over_needs( archetypeWeight[need] × avgNeed[need] ) / Σ archetypeWeight
stars(satisfaction) = clamp(0.5 + 4.5 × (satisfaction / 100)^1.2, 0.5, 5.0)   — rounded to halves
```

### 4.3 Reputation update (Phase 5 — designed)

Reputation is a 0.5–5.0 star EWMA over cruise outcomes:

```
reputation' = (1 − REPUTATION_SMOOTHING) × reputation + REPUTATION_SMOOTHING × cruiseStars
```

### 4.4 Demand per route (Phase 5 — designed)

For a Route with base regional demand `D₀` (from region + season tables), ticket price `p`, and
reference price `p₀` for the ship class:

```
demand = D₀ × (p / p₀)^PRICE_ELASTICITY × (0.6 + 0.4 × reputation / 5)
bookings = min(demand, cabinCapacity)
```

### 4.5 Revenue (Phase 5 — designed; fuel side live in Phase 1)

```
cruiseRevenue = ticketRevenue + onboardSpend + excursionCut
cruiseCosts   = fuel + wages + provisions + portFees + upkeep
profit        = cruiseRevenue − cruiseCosts
```

Phase 1 implements only the `fuel` term (§4.1) and `portFees` at 0× multiplier.

## 5. Content schemas

Zod schemas live in `src/sim/data/schemas.ts`; JSON in `/data`. Adding entries never requires
code changes — files are validated at load.

### 5.1 `data/ports.json` — array of Port

| Field         | Type                                                              | Meaning                                                                                                                                            |
| ------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | string (kebab-case, unique)                                       | Stable reference key used by routes and excursions.                                                                                                |
| `name`        | string                                                            | Display name, e.g. "Cozumel".                                                                                                                      |
| `country`     | string                                                            | Country or territory.                                                                                                                              |
| `region`      | `"caribbean" \| "mediterranean" \| "alaska" \| "northern-europe"` | Demand region.                                                                                                                                     |
| `lat`, `lon`  | number (degrees, WGS84)                                           | Position on the globe. lat −90…90, lon −180…180.                                                                                                   |
| `sizeTier`    | 1–4                                                               | 1 = tender village, 4 = megaport. Gates ship classes (Phase 5) and sets port fees.                                                                 |
| `attractions` | array of `{ name, kind }`, 4–8 entries                            | Real signature attractions. `kind` is a free tag (`beach`, `historic`, `nature`, `adventure`, `culture`, `scenic`, `family`, `nightlife`, `food`). |

### 5.2 `data/dining.json` — `{ buffets, restaurants, bars }`

Each entry: `id` (unique), `name`, plus:

| Field                        | Type                  | Meaning                                                      |
| ---------------------------- | --------------------- | ------------------------------------------------------------ |
| `theme` / `cuisine` / `type` | string                | Buffet theme, restaurant cuisine, or bar type.               |
| `cost`                       | number ($/day upkeep) | Daily operating cost when installed.                         |
| `appeal`                     | 1–10                  | Base draw of the venue.                                      |
| `tags`                       | string[]              | Appeal tags matched against archetype preferences (Phase 3). |

### 5.3 `data/excursions.json` — array of Excursion

| Field           | Type            | Meaning                                          |
| --------------- | --------------- | ------------------------------------------------ |
| `id`            | string (unique) |                                                  |
| `portId`        | string          | Must reference an existing Port id (validated).  |
| `name`          | string          | e.g. "Chankanaab Park snorkel".                  |
| `durationHours` | number          | Must fit inside `PORT_STAY_HOURS`.               |
| `pricePerGuest` | number ($)      | Player receives an excursion cut (Phase 5).      |
| `capacity`      | number          | Max guests per Port Day.                         |
| `appealTags`    | string[]        | Matched against archetype preferences (Phase 3). |

## 6. Phase checklist

- [x] **Phase 0 — Foundations**: scaffold (Vite/TS/Pixi/Three, ESLint/Prettier, Vitest, Pages CI); GAME_RULES.md + ARCHITECTURE.md; GameState + tick clock + save/load; `/data` JSON files with zod validation.
- [x] **Phase 1 — Globe & routes**: interactive globe (spin/zoom/pins/hover cards); route planner with arcs and distance/day estimates; ship dot sailing the route with arrival/departure log; HUD (money, date, speed, route).
- [ ] **Phase 2 — Ship builder**: grid deck editor, room modules (Pixi).
- [ ] **Phase 3 — Crew & passengers**: hiring, morale, archetypes, needs sim.
- [ ] **Phase 4 — Dining, excursions, events**: menus, bookings, event scheduler.
- [ ] **Phase 5 — Economy & reputation**: full revenue/cost model, demand, star gates.
- [ ] **Phase 6 — Emergencies**: implement Incidents on the existing event bus.

## 7. Open questions

- **Port fees in Phase 1**: constants and formula exist, but charging them before the revenue side
  lands (Phase 5) would only drain money. Currently charged at 0×. Decide when Phase 5 lands.
- **Seasonality**: demand tables per region/season are designed (§4.4) but the season calendar
  (which months favor Alaska vs Caribbean) is not yet specified.
- **Do routes need explicit sea-lane routing?** Great-circle legs can cross land (e.g. Miami →
  Cozumel clips Cuba visually). Acceptable for v0.1; revisit with waypoint routing later.
- **St. Petersburg / Baltic coverage**: omitted for now (cruise lines suspended calls); Northern
  Europe region leans Norway/Iceland instead.
- **Day/night cycle on the globe**: optional per the brief; not scheduled to a phase yet.
