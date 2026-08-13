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
| `SHIP_GRID.coastal`                 | 6 decks × 24 cols        | cells                     | Deck-editor grid per class; panamax 8×32, grande 10×40 _(locked)_.                                                              |
| `DECK_ZONES.coastal`                | top/cab/cab/ven/ven/svc  | zone per deck             | Vertical zoning bands, §4.1c. Per-class tables in `constants.ts`.                                                               |
| `ELEVATOR_COLS.coastal`             | 5 / 12 / 19              | columns                   | Fore/mid/aft elevator cores spanning all decks; unbuildable.                                                                    |
| `HULL_END_FRACTION`                 | 1/3                      | —                         | Bow/stern band width for `hullEnd` modules (bridge forward, engine aft).                                                        |
| `MODULE_SELL_REFUND`                | 0.5                      | —                         | Fraction of module cost refunded on sale.                                                                                       |
| `SEA_GRID_DEG`                      | 0.5                      | degrees                   | Ocean-grid resolution for sea routing (§4.1).                                                                                   |
| `SEA_SNAP_MAX_CELLS`                | 4                        | cells                     | Max distance a coastal port snaps to open water.                                                                                |
| `SEA_LOS_SAMPLE_NM`                 | 8                        | nm                        | Water-check sampling when smoothing routes; below narrowest cell width.                                                         |
| `NEED_DECAY_PER_TICK.food`          | 4                        | pts / tick                | Needs are 0–100. _(Phase 3)_                                                                                                    |
| `NEED_DECAY_PER_TICK.fun`           | 3                        | pts / tick                | _(Phase 3)_                                                                                                                     |
| `NEED_DECAY_PER_TICK.rest`          | 2                        | pts / tick                | _(Phase 3)_                                                                                                                     |
| `NEED_DECAY_PER_TICK.novelty`       | 1.5                      | pts / tick                | _(Phase 3)_                                                                                                                     |
| `ARCHETYPE_NEED_WEIGHTS`            | see `constants.ts`       | —                         | Per-archetype multipliers on decay & scoring. _(Phase 3)_                                                                       |
| `CREW_MORALE_DECAY_PER_SAILING_DAY` | 1.5                      | pts / day                 | Morale 0–100. _(Phase 3)_                                                                                                       |
| `NEED_REGEN_PER_TICK`               | food 9 / fun 7 / rest 12 | pts / tick                | Base replenishment at full coverage & quality 1.0 (§4.2b).                                                                      |
| `NEED_START`                        | 80                       | pts                       | Cohort needs at boarding.                                                                                                       |
| `NOVELTY_PORT_BOOST`                | 35                       | pts                       | First call at a new port per cruise.                                                                                            |
| `NIGHT_HOURS`                       | 22:00–06:00              | sim hours                 | Rest replenishes only at night.                                                                                                 |
| `SELF_SERVICE_QUALITY`              | 0.15                     | —                         | Service quality with no covering crew.                                                                                          |
| `CREW_MORALE_RECOVERY_PER_PORT_DAY` | 3                        | pts / day                 | Counterpart to the sailing decay.                                                                                               |
| `WAGE_SKILL_FACTOR`                 | 0.7 + 0.15 × skill       | —                         | Wage multiplier on the role base.                                                                                               |
| `ENGINEER_FUEL_SAVING_PER_SKILL`    | 0.03                     | —                         | Best engineer trims fuel, max 15%.                                                                                              |
| `CANDIDATES_PER_WEEK`               | 6                        | candidates                | Hiring pool size; rotates weekly (168 ticks), seeded.                                                                           |
| `CREW_STARTING_MORALE`              | 85                       | pts                       | Morale for new hires.                                                                                                           |
| `ARCHETYPE_MIX`                     | 30/20/20/15/15 %         | —                         | families/retirees/party/luxury/adventurers cohort split.                                                                        |
| `FARE_PER_NIGHT`                    | 180                      | $ / guest-night           | PLACEHOLDER fare until Phase 5 demand (§4.4).                                                                                   |
| `PRICE_ELASTICITY`                  | −1.4                     | —                         | Exponent in demand curve §4.4. _(Phase 5)_                                                                                      |
| `SATISFACTION_TO_STARS`             | see §4.2                 | —                         | Piecewise mapping. _(Phase 5)_                                                                                                  |
| `REPUTATION_SMOOTHING`              | 0.2                      | —                         | EWMA weight for new cruise outcomes §4.3. _(Phase 5)_                                                                           |

## 4. Formulas

Written in plain math. Implemented (or to be implemented) as pure functions in `src/sim/`.

### 4.1 Fuel cost & sea routing (Phase 1 — live)

For a Leg of sea-route length `d` nautical miles sailed by ship class `c`:

```
fuelCost(d, c) = d × FUEL_COST_PER_NM[c]
```

Charged continuously while sailing: each tick underway costs
`SHIP_SPEED_KNOTS[c] × FUEL_COST_PER_NM[c]` dollars (distance covered that hour × unit cost).

**Sea routing**: `d` is not the direct great circle — it is the length of a water-only path.
The world's land polygons are rasterized into a `SEA_GRID_DEG` ocean grid (a cell is water if
open sea covers its center); A* finds the shortest water path between ports (8-connected, no
diagonal corner-cutting, longitude wraps); a line-of-sight pass sampled every
`SEA_LOS_SAMPLE_NM` smooths the staircase while staying on water. Straits narrower than one
cell (Øresund, Gibraltar, Dover, Juan de Fuca, the Inside Passage approaches) are hand-carved
corridors, as in real marine routing networks. Within 60 nm of a port the path is below grid
resolution (harbor approach) and may visually hug the coast. Point distances use the haversine
formula with Earth radius 3440.065 nm.

### 4.1b Module upkeep (Phase 2 — live)

Each placed Module accrues upkeep continuously, docked or sailing:

```
upkeepPerTick = Σ_over_placed_modules( upkeepPerDay ) / 24
```

Buying a module charges its full `cost` immediately; selling refunds
`cost × MODULE_SELL_REFUND`. Placement rules: modules must fit the `SHIP_GRID` for the ship's
class, may not overlap, and `placement: "top"` modules (pool, bridge) must sit on the top deck
while `"bottom"` modules (engine) must touch the keel.

### 4.1c Deck zoning (Phase 2.5 — live)

Grounded in how real cruise ships are arranged (researched against published deck plans:
public venues on decks ~3–5, cabins ~6–10, Lido/pool/buffet/spa ~9–15, bridge upper-forward,
crew below passengers, machinery lowest and aft, elevator banks forward/midship/aft, cabin
decks running two parallel port/starboard corridors):

- Every deck belongs to a **zone band** (`DECK_ZONES`, top → bottom): `top` (Lido & open
  decks), `cabins` (mid accommodation decks), `venues` (lower entertainment/dining decks),
  `service` (crew & machinery). A module may only occupy decks whose zone is in its `zones`
  list; multi-deck modules must satisfy every deck they span.
- **Elevator cores** (`ELEVATOR_COLS`) run fore/mid/aft through all decks and are
  unbuildable. Cabin decks render twin corridors; passenger circulation becomes functional
  in Phase 3.
- **Hull ends**: `hullEnd: "forward"` modules (bridge) must sit fully in the bow third,
  `"aft"` (engine) in the stern third (`HULL_END_FRACTION`).
- **Cabin windows**: `view: "oceanview" | "balcony"` cabins need hull windows, so they may
  not sit in columns adjacent to an elevator core; `balcony` cabins are restricted to the
  highest cabin deck. `inside` cabins go anywhere in the cabin band. (The side cutaway
  cannot show port/starboard, so core-adjacency stands in for "interior" berths.)

### 4.2 Satisfaction score (Phase 3 — live)

Per passenger at cruise end, needs averaged over the cruise (`avgNeed ∈ [0,100]`):

```
satisfaction = Σ_over_needs( archetypeWeight[need] × avgNeed[need] ) / Σ archetypeWeight
stars(satisfaction) = clamp(0.5 + 4.5 × (satisfaction / 100)^1.2, 0.5, 5.0)   — rounded to halves
```

### 4.2b Needs & crew service (Phase 3 — live)

Cohorts (archetype groups with averaged needs, not individual agents) board at the home port
with every need at `NEED_START`. Per tick, per group:

```
need' = clamp(need − NEED_DECAY_PER_TICK[need] × archetypeWeight[need] + regen, 0, 100)
regen(food|fun)  = NEED_REGEN_PER_TICK[need] × coverage × quality        (all day)
regen(rest)      = NEED_REGEN_PER_TICK.rest × coverage × quality         (night hours only)
coverage         = min(1, Σ venue capacity serving need / guests)         (rest: cabin berths)
quality          = avg over covering crew of (skill/3 × morale/100), or SELF_SERVICE_QUALITY
```

Novelty has no service regen: it decays at sea and jumps `NOVELTY_PORT_BOOST` on the first
call at each new port per cruise. Crew morale falls `CREW_MORALE_DECAY_PER_SAILING_DAY` at sea
and recovers `CREW_MORALE_RECOVERY_PER_PORT_DAY` docked. Wages drain continuously. Departure
requires engine + bridge + a captain. The best engineer aboard multiplies fuel cost by
`1 − skill × ENGINEER_FUEL_SAVING_PER_SKILL`.

### 4.3 Reputation update (Phase 3 — live)

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

Phase 3 implements `fuel`, `wages`, `upkeep`, and a placeholder `ticketRevenue`
(`guests × FARE_PER_NIGHT × nights`, collected at boarding). Onboard spend, excursion cut,
provisions, real port fees, and demand-driven pricing remain for Phase 5.

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

### 5.4 `data/modules.json` — array of Module

| Field          | Type                                                                           | Meaning                                                     |
| -------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `id`           | string (unique)                                                                | Referenced by `ShipLayout.placed`.                          |
| `name`         | string                                                                         | Display name.                                               |
| `category`     | `cabin \| dining \| entertainment \| wellness \| family \| crew \| operations` | Drives editor grouping, tile color, and stats aggregation.  |
| `w`, `h`       | int (cells)                                                                    | Footprint: `w` along the deck, `h` in stacked decks (1–2).  |
| `cost`         | number ($)                                                                     | One-time purchase price.                                    |
| `upkeepPerDay` | number ($/day)                                                                 | Continuous drain, §4.1b.                                    |
| `capacity`     | int                                                                            | Guests served (cabins → passenger capacity; crew → berths). |
| `placement`    | `any \| top \| bottom`                                                         | Deck restriction.                                           |
| `zones`        | array of `top \| cabins \| venues \| service`                                  | Zone bands the module may occupy (§4.1c).                   |
| `hullEnd`      | `forward \| aft` (optional)                                                    | Bow/stern restriction (bridge forward, engine aft).         |
| `view`         | `inside \| oceanview \| balcony` (optional, cabins)                            | Window class; drives hull-window rules (§4.1c).             |
| `appealTags`   | string[]                                                                       | Matched against archetype preferences (Phase 3).            |

### 5.5 `data/crew.json` — `{ roles, firstNames, lastNames }`

| Field                  | Type                                     | Meaning                                                 |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------- |
| `roles[].id`           | string (unique)                          | Referenced by crew members and candidates.              |
| `roles[].label`        | string                                   | Display name.                                           |
| `roles[].serves`       | `food \| fun \| rest \| novelty \| null` | Need this role's quality applies to; null = structural. |
| `roles[].wagePerDay`   | number ($)                               | Base wage before the skill multiplier.                  |
| `firstNames/lastNames` | string[]                                 | Name pools for generated candidates.                    |

## 6. Phase checklist

- [x] **Phase 0 — Foundations**: scaffold (Vite/TS/Pixi/Three, ESLint/Prettier, Vitest, Pages CI); GAME_RULES.md + ARCHITECTURE.md; GameState + tick clock + save/load; `/data` JSON files with zod validation.
- [x] **Phase 1 — Globe & routes**: interactive globe (spin/zoom/pins/hover cards); route planner with arcs and distance/day estimates; ship dot sailing the route with arrival/departure log; HUD (money, date, speed, route).
- [x] **Phase 2 — Ship builder**: grid deck editor, room modules (Pixi).
- [x] **Phase 3 — Crew & passengers**: hiring, morale, archetypes, needs sim.
- [ ] **Phase 4 — Dining, excursions, events**: menus, bookings, event scheduler.
- [ ] **Phase 5 — Economy & reputation**: full revenue/cost model, demand, star gates.
- [ ] **Phase 6 — Emergencies**: implement Incidents on the existing event bus.

## 7. Open questions

- **Port fees in Phase 1**: constants and formula exist, but charging them before the revenue side
  lands (Phase 5) would only drain money. Currently charged at 0×. Decide when Phase 5 lands.
- **Seasonality**: demand tables per region/season are designed (§4.4) but the season calendar
  (which months favor Alaska vs Caribbean) is not yet specified.
- ~~Do routes need explicit sea-lane routing?~~ **Resolved**: water-grid A* routing shipped
  (§4.1). Remaining follow-ups: Panama/Suez/Bosphorus corridors are not carved yet — needed
  before cross-basin routes (e.g. Caribbean → Alaska) look right.
- **St. Petersburg / Baltic coverage**: omitted for now (cruise lines suspended calls); Northern
  Europe region leans Norway/Iceland instead.
- **Day/night cycle on the globe**: optional per the brief; not scheduled to a phase yet.
