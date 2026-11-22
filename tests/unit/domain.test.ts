import { describe, expect, it } from 'vitest';
import { normalizeName, selectBestOffers } from '../../src/domain';
import { fixtures } from '../../src/fixtures';
import type { SupplierHotel } from '../../src/types';

const hotel = (name: string, price: number, commissionPct = 10): SupplierHotel => ({ hotelId: '1', city: 'delhi', name, price, commissionPct });
describe('best-offer selection', () => {
  it('deduplicates overlaps, selects the cheaper supplier and keeps exclusive hotels', () => {
    const results = selectBestOffers([
      { supplier: 'Supplier A', hotels: fixtures['Supplier A'].filter(h => h.city === 'delhi') },
      { supplier: 'Supplier B', hotels: fixtures['Supplier B'].filter(h => h.city === 'delhi') },
    ]);
    expect(results).toEqual([
      { name: 'City Garden', price: 3200, supplier: 'Supplier A', commissionPct: 8 },
      { name: 'Lotus Palace', price: 4500, supplier: 'Supplier B', commissionPct: 12 },
      { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
      { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
      { name: 'The Imperial', price: 12000, supplier: 'Supplier A', commissionPct: 15 },
    ]);
  });
  it('normalizes whitespace, case and compatibility characters', () => {
    expect(normalizeName('  ＨＯＬＴＩＮ  Hotel ')).toBe('holtin hotel');
    expect(selectBestOffers([
      { supplier: 'Supplier A', hotels: [hotel('  HOTEL   ONE ', 200), hotel('hotel one', 150)] },
      { supplier: 'Supplier B', hotels: [hotel('Hotel One', 100)] },
    ])).toHaveLength(1);
  });
  it('resolves equal-price ties deterministically, regardless of supplier ordering or commission', () => {
    const a = { supplier: 'Supplier A' as const, hotels: [hotel('Holtin', 100, 2)] };
    const b = { supplier: 'Supplier B' as const, hotels: [hotel('HOLTiN', 100, 99)] };
    expect(selectBestOffers([a, b])).toEqual(selectBestOffers([b, a]));
    expect(selectBestOffers([a, b])[0]?.supplier).toBe('Supplier A');
  });
  it('handles empty input and zero-priced offers', () => {
    expect(selectBestOffers([])).toEqual([]);
    expect(selectBestOffers([{ supplier: 'Supplier A', hotels: [hotel('Free', 0)] }])[0]?.price).toBe(0);
  });
});
