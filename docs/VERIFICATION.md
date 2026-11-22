# Verification record

Verified on **22 November 2026 (Asia/Kolkata)** against application commit `bde12762a0770fb0b2fa7c738d82d651bff49f0b`.

## Automated checks

[GitHub Actions run 45047963708](https://github.com/jaideepug23/hotel-offer-orchestrator/actions/runs/45047963708) completed successfully with all three jobs green:

| Check | Observed result |
|---|---|
| TypeScript checking and build | Passed |
| Unit and HTTP contract tests | 26 passed |
| Real Temporal + Redis integration tests | 8 passed |
| Workflow replay and parallel activity scheduling | Passed using recorded execution history |
| Full Docker Compose stack | Built, started, and passed API smoke tests |
| Supplier B outage and recovery | Expected 503 response and degraded health; restored searches passed |
| Worker restart | API smoke tests passed after restart |
| Self-contained demo container | Passed the same API smoke suite with Docker memory limited to 512 MiB |
| Demo memory snapshot after tests | 248.6 MiB / 512 MiB; not a long-duration capacity benchmark |
| Complete npm dependency audit, including development tools | 0 vulnerabilities reported at verification time |

## Live deployment

- Service: https://hotel-offer-orchestrator-g9vu.onrender.com
- Render service ID: `srv-dc1i46ss728c73cgl650`
- Initial deployment ID: `dep-dc1i474s728c73cgl7ug`
- Hosting: free Docker web service, `Dockerfile.demo`
- The smoke suite was run against the public HTTPS URL and passed: all five dependencies healthy, exact Delhi winners, inclusive Redis price bounds, unknown city, Mumbai inventory, validation, workflow tracing, and eight concurrent searches.

## Browser checks

Verified against the live service:

1. Initial Delhi search shows 8 supplier listings, 5 unique hotels, and 5 matching offers.
2. The ₹5,340–5,900 preset returns Holtin from Supplier B and Radison from Supplier A.
3. Atlantis returns an empty state and the exact API response `[]`.
4. A reversed range shows a clear validation message.
5. Clearing filters restores all five Delhi results.
6. The inspected browser error log was empty.

The dashboard is left open with a successful unfiltered Delhi comparison. A screenshot of the live filtered comparison is included in the delivery outputs.

## Limits

The free Render instance can sleep and its local data/history is ephemeral. The Compose configuration provides persistent PostgreSQL and Redis volumes. These results verify the tested scenarios; they do not claim production load capacity, real supplier integration, or guaranteed selection in an assessment.
