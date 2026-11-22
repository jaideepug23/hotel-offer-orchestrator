import { Redis } from 'ioredis';
import type { HotelOffer, HotelQuery } from './types';

// A single script replaces a city snapshot and queries it atomically. Concurrent
// requests cannot read another workflow's snapshot between write and filtering.
// Braces put both keys in the same Redis Cluster hash slot.
export const STORE_AND_FILTER = `
local offers = cjson.decode(ARGV[1])
redis.call('DEL', KEYS[1])
for _, offer in ipairs(offers) do
  redis.call('ZADD', KEYS[1], offer.price, cjson.encode(offer))
end
redis.call('EXPIRE', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tostring(#offers), 'EX', ARGV[2])
return redis.call('ZRANGE', KEYS[1], ARGV[3], ARGV[4], 'BYSCORE')
`;

export function createRedis(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    commandTimeout: 4000,
    enableOfflineQueue: false,
    retryStrategy: attempts => Math.min(attempts * 250, 3000),
  });
}
export function cityKeys(city: string): [string, string] {
  const tag = encodeURIComponent(city);
  return [`hotel-offers:{${tag}}:prices`, `hotel-offers:{${tag}}:count`];
}
export async function storeAndFilter(redis: Redis, offers: HotelOffer[], query: HotelQuery, ttl: number): Promise<HotelOffer[]> {
  const rows = await redis.eval(STORE_AND_FILTER, 2, ...cityKeys(query.city),
    JSON.stringify(offers), String(ttl), String(query.minPrice ?? '-inf'), String(query.maxPrice ?? '+inf')) as string[];
  return rows.map(row => JSON.parse(row) as HotelOffer);
}
