# Five-minute reviewer walkthrough

## 1. Demonstrate the required behavior

Open the dashboard and search **Delhi** without price bounds. There are eight raw supplier listings and five unique winners. Holtin comes from Supplier B at ₹5,340; Radison comes from Supplier A at ₹5,900. City Garden and Lotus Palace demonstrate hotels unique to one supplier. The Imperial demonstrates case/whitespace normalization and deterministic equal-price ties.

Choose the **₹5,340–5,900** preset. Both boundary values remain, proving inclusive filtering. The API response remains the exact array shape requested in the brief.

Search **atlantis**. The correct result is an empty array, not an error and not fabricated inventory. Enter a reversed range to show validation.

## 2. Show the actual architecture

Copy the workflow ID from the dashboard or `X-Workflow-Id` response header. In a local Compose deployment, open Temporal at http://localhost:8080 and locate that execution. Show the two supplier activities scheduled in parallel, followed by the Redis save/filter activity.

Open `src/workflows.ts`: orchestration is in Temporal, I/O is in activities, and `src/domain.ts` is pure deterministic comparison logic. Workflow replay is an automated test.

## 3. Prove Redis does the filtering

After the filtered request, run:

```bash
docker compose exec redis redis-cli ZCARD 'hotel-offers:{delhi}:prices'
docker compose exec redis redis-cli ZRANGE 'hotel-offers:{delhi}:prices' 5340 5900 BYSCORE
```

The sorted set still contains five winners; the range query returns two. Show `src/redis-store.ts`: the atomic Lua script both persists the complete result and queries by price inside Redis. It does not fetch everything into JavaScript for filtering.

## 4. Demonstrate failure recovery

Follow the README's `SUPPLIER_B_DOWN=true` instructions in a local deployment. The workflow retries three times, the comparison returns 503, and `/health` identifies Supplier B. Restore the supplier and search again. Explain that reporting a partial list as the best price would be misleading, so this implementation fails closed.

GitHub Actions runs this scenario against the full Docker stack, then restarts the worker and checks the API again. The integration suite separately proves a transient supplier failure recovers through a real activity retry.

## 5. Discuss the tradeoffs clearly

- Name-based deduplication follows the assessment. A real booking platform would use canonical property IDs.
- Equal-price ties prefer Supplier A deterministically. Commission is returned unchanged and never overrides the lowest-price requirement.
- Every request refreshes through Temporal. Redis stores the latest full city snapshot with TTL; it is not used as a shortcut around the workflow.
- Atomic Redis write-and-filter prevents cross-request snapshot races. The two supplier APIs themselves do not provide a distributed transactional snapshot.
- The free Render demo runs real services in one container and has ephemeral storage. The Compose stack separates services and persists Temporal history in PostgreSQL plus Redis AOF data.
- Prices use one currency and deterministic mock inventory. No real inventory, booking, payment, or selection guarantee is implied.

## Submission files

Submit the GitHub repository and live demo URL. The repository includes source, both Dockerfiles, Compose, README, OpenAPI, Postman collections, CI and tests. The repository is private by default; give the evaluator access before sharing it, or intentionally change its visibility when ready.
