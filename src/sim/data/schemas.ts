import { z } from 'zod';

// Field-by-field documentation lives in GAME_RULES.md §5.

export const RegionSchema = z.enum(['caribbean', 'mediterranean', 'alaska', 'northern-europe']);

export const AttractionSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
});

export const PortSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'kebab-case id'),
  name: z.string().min(1),
  country: z.string().min(1),
  region: RegionSchema,
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  sizeTier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  attractions: z.array(AttractionSchema).min(4).max(8),
});

export const PortsFileSchema = z.array(PortSchema);

const venueBase = {
  id: z.string().min(1),
  name: z.string().min(1),
  cost: z.number().nonnegative(),
  appeal: z.number().min(1).max(10),
  tags: z.array(z.string().min(1)),
};

export const BuffetSchema = z.object({ ...venueBase, theme: z.string().min(1) });
export const RestaurantSchema = z.object({ ...venueBase, cuisine: z.string().min(1) });
export const BarSchema = z.object({ ...venueBase, type: z.string().min(1) });

export const DiningFileSchema = z.object({
  buffets: z.array(BuffetSchema),
  restaurants: z.array(RestaurantSchema),
  bars: z.array(BarSchema),
});

export const ExcursionSchema = z.object({
  id: z.string().min(1),
  portId: z.string().min(1),
  name: z.string().min(1),
  durationHours: z.number().positive(),
  pricePerGuest: z.number().nonnegative(),
  capacity: z.number().int().positive(),
  appealTags: z.array(z.string().min(1)),
});

export const ExcursionsFileSchema = z.array(ExcursionSchema);

export const ModuleCategorySchema = z.enum([
  'cabin',
  'dining',
  'entertainment',
  'wellness',
  'family',
  'crew',
  'operations',
]);

/**
 * Vertical zone bands, top → bottom, mirroring real deck plans:
 * `top` = Lido & open decks (pool, buffet, gym, bridge), `cabins` = mid
 * accommodation decks, `venues` = lower entertainment/dining decks,
 * `service` = crew & machinery below the passenger decks.
 */
export const DeckZoneSchema = z.enum(['top', 'cabins', 'venues', 'service']);

export const ModuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: ModuleCategorySchema,
  /** Footprint in deck-grid cells: w along the deck, h in stacked decks. */
  w: z.number().int().min(1).max(6),
  h: z.number().int().min(1).max(2),
  cost: z.number().nonnegative(),
  upkeepPerDay: z.number().nonnegative(),
  /** Guests served (or crew housed); 0 for pure operations rooms. */
  capacity: z.number().int().nonnegative(),
  /** Deck restriction: 'top' must touch the top deck, 'bottom' the keel. */
  placement: z.enum(['any', 'top', 'bottom']),
  /** Zone bands every occupied deck must belong to. */
  zones: z.array(DeckZoneSchema).min(1),
  /** Bow/stern restriction: bridge sits forward, machinery aft. */
  hullEnd: z.enum(['forward', 'aft']).optional(),
  /** Cabins only: window class. Drives hull-window placement rules. */
  view: z.enum(['inside', 'oceanview', 'balcony']).optional(),
  /** Passenger need this venue replenishes (Phase 3). Cabins implicitly serve rest. */
  servesNeed: z.enum(['food', 'fun', 'rest']).optional(),
  appealTags: z.array(z.string().min(1)),
});

export const ModulesFileSchema = z.array(ModuleSchema);

export type Port = z.infer<typeof PortSchema>;
export type Attraction = z.infer<typeof AttractionSchema>;
export type Buffet = z.infer<typeof BuffetSchema>;
export type Restaurant = z.infer<typeof RestaurantSchema>;
export type Bar = z.infer<typeof BarSchema>;
export type Dining = z.infer<typeof DiningFileSchema>;
export type Excursion = z.infer<typeof ExcursionSchema>;
export const CrewRoleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Need this role's service quality applies to; null = structural role. */
  serves: z.enum(['food', 'fun', 'rest', 'novelty']).nullable(),
  /** Base wage before the skill multiplier (GAME_RULES §4.2b). */
  wagePerDay: z.number().positive(),
});

export const CrewFileSchema = z.object({
  roles: z.array(CrewRoleSchema).min(1),
  firstNames: z.array(z.string().min(1)).min(10),
  lastNames: z.array(z.string().min(1)).min(10),
});

export const ShipEventSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Module id the event needs aboard (e.g. "theater"). Cross-checked at load. */
  venue: z.string().min(1),
  durationHours: z.number().positive(),
  costPerRun: z.number().nonnegative(),
  /** Need deltas applied to guests when the event runs (may be negative). */
  boosts: z.record(z.enum(['food', 'fun', 'rest', 'novelty']), z.number()),
  /** Matched against archetype preferred tags for extra effect. */
  tags: z.array(z.string().min(1)),
});

export const EventsFileSchema = z.array(ShipEventSchema);

export type ModuleCategory = z.infer<typeof ModuleCategorySchema>;
export type ShipModule = z.infer<typeof ModuleSchema>;
export type DeckZone = z.infer<typeof DeckZoneSchema>;
export type CrewRole = z.infer<typeof CrewRoleSchema>;
export type CrewData = z.infer<typeof CrewFileSchema>;
export type ShipEvent = z.infer<typeof ShipEventSchema>;

/** A dining venue theme with the kind of module it can be assigned to. */
export type DiningTheme = (Buffet | Restaurant | Bar) & {
  kind: 'buffet' | 'restaurant' | 'bar';
};
