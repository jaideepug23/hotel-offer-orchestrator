import { log, proxyActivities } from '@temporalio/workflow';
import type { Activities } from './activities';
import type { HotelOffer, HotelQuery } from './types';
import { selectBestOffers } from './domain';

const { fetchSupplier, saveAndFilterOffers } = proxyActivities<Activities>({
  startToCloseTimeout: '7 seconds',
  scheduleToCloseTimeout: '25 seconds',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '3 seconds', maximumAttempts: 3 },
});

export async function hotelOffersWorkflow(query: HotelQuery): Promise<HotelOffer[]> {
  log.info('Hotel comparison started', { city: query.city });
  // Both activities are scheduled before either is awaited.
  const [a, b] = await Promise.all([
    fetchSupplier('Supplier A', query.city),
    fetchSupplier('Supplier B', query.city),
  ]);
  const best = selectBestOffers([a, b]);
  const result = await saveAndFilterOffers(best, query);
  log.info('Hotel comparison completed', { uniqueHotels: best.length, returned: result.length });
  return result;
}
