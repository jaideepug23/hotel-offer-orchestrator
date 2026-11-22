import type { HotelOffer, SupplierResult } from './types';

export function normalizeName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Pure and deterministic: safe to replay inside a Temporal workflow.
export function selectBestOffers(results: SupplierResult[]): HotelOffer[] {
  const best = new Map<string, HotelOffer>();
  for (const { supplier, hotels } of results) {
    for (const hotel of hotels) {
      const key = normalizeName(hotel.name);
      const candidate: HotelOffer = {
        name: hotel.name.normalize('NFKC').trim().replace(/\s+/g, ' '),
        price: hotel.price,
        supplier,
        commissionPct: hotel.commissionPct,
      };
      const current = best.get(key);
      if (!current || candidate.price < current.price ||
        (candidate.price === current.price &&
          (candidate.supplier < current.supplier ||
            (candidate.supplier === current.supplier && candidate.name < current.name)))) {
        best.set(key, candidate);
      }
    }
  }
  return [...best.values()].sort((a, b) => a.price - b.price || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
