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

export type Port = z.infer<typeof PortSchema>;
export type Attraction = z.infer<typeof AttractionSchema>;
export type Buffet = z.infer<typeof BuffetSchema>;
export type Restaurant = z.infer<typeof RestaurantSchema>;
export type Bar = z.infer<typeof BarSchema>;
export type Dining = z.infer<typeof DiningFileSchema>;
export type Excursion = z.infer<typeof ExcursionSchema>;
