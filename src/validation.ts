import { z } from 'zod';
import { normalizeName } from './domain';

const price = z.string()
  .regex(/^\d+(?:\.\d{1,2})?$/, 'Use a non-negative decimal with at most two decimal places')
  .transform(Number).pipe(z.number().finite().max(1_000_000_000));
export const citySchema = z.string().min(1).max(80)
  .transform(normalizeName)
  .pipe(z.string().min(1).regex(/^[\p{L}\p{M}][\p{L}\p{M} '\-]*$/u, 'Use a city name'));
export const querySchema = z.object({
  city: citySchema,
  minPrice: price.optional(),
  maxPrice: price.optional(),
}).strict().refine(q => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice,
  { message: 'minPrice must be less than or equal to maxPrice', path: ['maxPrice'] });

export const supplierHotelsSchema = z.array(z.object({
  hotelId: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  price: z.number().finite().nonnegative().max(1_000_000_000),
  city: citySchema,
  commissionPct: z.number().finite().min(0).max(100),
})).max(10000);
