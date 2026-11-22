import { ApplicationFailure, log } from '@temporalio/activity';
import type { Redis } from 'ioredis';
import type { Config } from './config';
import type { HotelOffer, HotelQuery, Supplier, SupplierResult } from './types';
import { supplierHotelsSchema } from './validation';
import { storeAndFilter } from './redis-store';

export function createActivities(config: Config, redis: Redis) {
  return {
    async fetchSupplier(supplier: Supplier, city: string): Promise<SupplierResult> {
      const path = supplier === 'Supplier A' ? '/supplierA/hotels' : '/supplierB/hotels';
      const url = new URL(path, config.SUPPLIER_BASE_URL);
      url.searchParams.set('city', city);
      log.info('Fetching hotel offers', { supplier, city });
      const response = await fetch(url, { signal: AbortSignal.timeout(config.SUPPLIER_TIMEOUT_MS) });
      if (!response.ok) {
        throw ApplicationFailure.create({
          message: `${supplier} returned HTTP ${response.status}`,
          type: 'SupplierUnavailable',
          nonRetryable: response.status >= 400 && response.status < 500 && response.status !== 429,
        });
      }
      const parsed = supplierHotelsSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.some(h => h.city !== city)) {
        throw ApplicationFailure.nonRetryable(`${supplier} returned invalid hotel data`, 'InvalidSupplierData');
      }
      log.info('Supplier offers received', { supplier, count: parsed.data.length });
      return { supplier, hotels: parsed.data };
    },
    async saveAndFilterOffers(offers: HotelOffer[], query: HotelQuery): Promise<HotelOffer[]> {
      const result = await storeAndFilter(redis, offers, query, config.OFFER_TTL_SECONDS);
      log.info('Offers saved and filtered in Redis', { city: query.city, total: offers.length, returned: result.length });
      return result;
    },
  };
}
export type Activities = ReturnType<typeof createActivities>;
