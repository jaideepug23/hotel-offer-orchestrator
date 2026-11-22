import { describe, expect, it } from 'vitest';
import { querySchema, supplierHotelsSchema } from '../../src/validation';

describe('query validation', () => {
  it('normalizes city and parses inclusive bounds', () => {
    expect(querySchema.parse({ city: '  DeLHi ', minPrice: '0', maxPrice: '5340.50' }))
      .toEqual({ city: 'delhi', minPrice: 0, maxPrice: 5340.5 });
  });
  it.each([
    {}, { city: '' }, { city: '   ' }, { city: ['delhi', 'mumbai'] },
    { city: 'delhi', minPrice: '-1' }, { city: 'delhi', minPrice: 'NaN' },
    { city: 'delhi', maxPrice: 'Infinity' }, { city: 'delhi', minPrice: '1e3' },
    { city: 'delhi', minPrice: '' }, { city: 'delhi', maxPrice: '2.999' },
    { city: 'delhi', minPrice: ['1', '2'] }, { city: 'delhi', minPrice: '6', maxPrice: '5' },
    { city: 'delhi', surprise: 'true' }, { city: 'delhi', maxPrice: '1000000001' },
  ])('rejects invalid or ambiguous input %j', input => expect(querySchema.safeParse(input).success).toBe(false));
  it('rejects malformed supplier offers', () => {
    expect(supplierHotelsSchema.safeParse([{ hotelId: 'a', name: 'Hotel', price: -1, city: 'delhi', commissionPct: 10 }]).success).toBe(false);
  });
});
