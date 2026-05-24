# Allo Inventory — Take-Home Exercise

Multi-warehouse inventory reservation system built with Next.js App Router, Prisma, Postgres, and Redis.

## Live Demo

**Production URL:** `https://your-app.vercel.app` *(replace after deployment)*

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                 │
│  ┌──────────────┐    ┌────────────────────────────────┐  │
│  │ Product list │    │ Reservation detail + countdown │  │
│  └──────┬───────┘    └───────────────┬────────────────┘  │
└─────────┼──────────────────────────-─┼───────────────────┘
          │ HTTP                       │ HTTP
┌─────────▼──────────────────────────-─▼───────────────────┐
│  Next.js API Routes (Vercel Edge/Node)                    │
│  POST /api/reservations  ← core concurrency logic         │
│  POST /api/reservations/:id/confirm                       │
│  POST /api/reservations/:id/release                       │
│  GET  /api/products  (lazy expiry cleanup on each read)   │
│  GET  /api/cron/expire  (Vercel Cron, every 2 min)        │
└──────────┬────────────────────────────────────────────────┘
           │
    ┌──────┴──────┐
    │             │
  Redis         Postgres (Neon)
  (lock +       (data of record)
  idempotency)
```

---

## How Concurrency Is Handled

This is the core of the exercise. Two layers protect against double-reserving the last unit:

### Layer 1 — Redis Distributed Lock (`src/lib/lock.ts`)

Before touching the database, we acquire a per-SKU Redis lock:

```
SET lock:stock:{productId}:{warehouseId} {uuid} NX PX 5000
```

`NX` means "only set if not exists" — if another request is already inside the critical section, this request gets a `LockConflictError` and returns 409 immediately, without ever hitting the database.

The lock is released via a Lua script that checks we still own it before deleting, preventing accidental release of a lock acquired by a different request (e.g. if our request ran long and the lock TTL expired).

### Layer 2 — Postgres `SELECT ... FOR UPDATE`

Inside the lock, we open a Postgres transaction and lock the stock row:

```sql
SELECT id, total, reserved FROM "Stock"
WHERE "productId" = $1 AND "warehouseId" = $2
FOR UPDATE
```

`FOR UPDATE` takes a row-level exclusive lock in Postgres. Even if two requests somehow got through the Redis layer (e.g. Redis is momentarily unavailable), Postgres prevents them from reading stale `reserved` counts concurrently. The check-then-increment becomes atomic.

**Why both?** Redis lock is faster (avoids DB round-trips for obvious conflicts) and works across multiple app servers. The Postgres `FOR UPDATE` is a correctness backstop that works even if Redis is down. Defence in depth.

---

## Reservation Expiry Mechanism

Three complementary approaches are used:

### 1. Vercel Cron (production — `vercel.json`)

```json
{ "path": "/api/cron/expire", "schedule": "*/2 * * * *" }
```

Runs every 2 minutes. Finds all `PENDING` reservations where `expiresAt <= NOW()`, marks them `RELEASED`, and decrements the `reserved` counter on the corresponding `Stock` rows. This is the primary cleanup mechanism in production.

### 2. Lazy cleanup on reads (`src/lib/expiry.ts`)

`GET /api/products` calls `releaseExpiredReservations()` before computing available stock. This ensures that even if the cron job hasn't run yet, availability figures shown to shoppers are accurate. The worst-case staleness without the cron is the time between product list page loads.

### 3. Frontend countdown

The checkout page runs a client-side countdown timer. When it hits zero, the UI immediately reflects the expired state (without waiting for a server round-trip), and the confirm/cancel buttons are hidden. This is purely UX — the server is the source of truth.

**Trade-off:** The cron approach means expired reservations can hold `reserved` units for up to 2 minutes beyond `expiresAt` in the worst case (if no product list read happens). For a production system with higher stakes, a Redis key with TTL that triggers a background job would give sub-second cleanup.

---

## Idempotency (Bonus)

`POST /api/reservations` and `POST /api/reservations/:id/confirm` support an `Idempotency-Key` header.

On first call: the operation runs, and the `{status, body}` pair is stored in the `IdempotencyRecord` table keyed by the header value.

On retry with the same key: the stored response is returned immediately, with an `X-Idempotent-Replay: true` header. The side effect (stock decrement, reservation creation) does **not** repeat.

Concurrent retries during the first call: if two requests with the same key arrive simultaneously, the first writer's result is stored (unique constraint on the key column). The second request re-fetches and returns the stored result.

Limitation: records are never cleaned up in this implementation. A production system would add a TTL index and a cron to purge old records.

---

## Local Development

### Prerequisites

- Node.js 18+
- A Postgres database (Neon free tier: https://neon.tech)
- A Redis instance (Upstash free tier: https://upstash.com)

### Setup

```bash
# 1. Clone and install
git clone https://github.com/yourusername/allo-inventory
cd allo-inventory
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL and REDIS_URL

# 3. Run migrations and seed
npm run db:push     # pushes schema to your hosted Postgres
npm run db:seed     # creates 3 warehouses, 6 products, stock rows

# 4. Start dev server
npm run dev
# Open http://localhost:3000
```

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (must be hosted, not local) |
| `REDIS_URL` | Redis connection string (Upstash format: `rediss://...`) |
| `CRON_SECRET` | Optional bearer token to protect the `/api/cron/expire` endpoint |

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/products` | List products with per-warehouse available stock |
| `GET` | `/api/warehouses` | List warehouses |
| `POST` | `/api/reservations` | Reserve units. 409 if insufficient stock. Supports `Idempotency-Key`. |
| `GET` | `/api/reservations/:id` | Fetch a single reservation |
| `POST` | `/api/reservations/:id/confirm` | Confirm reservation. 410 if expired. Supports `Idempotency-Key`. |
| `POST` | `/api/reservations/:id/release` | Release reservation early (idempotent) |
| `GET` | `/api/cron/expire` | Cron endpoint — release all expired pending reservations |

### Reserve request body

```json
{
  "productId": "cuid...",
  "warehouseId": "cuid...",
  "quantity": 1
}
```

---

## Deployment (Vercel + Neon + Upstash)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set env vars in Vercel dashboard or CLI:
vercel env add DATABASE_URL
vercel env add REDIS_URL
vercel env add CRON_SECRET

# Run migrations against production DB
DATABASE_URL="your-prod-url" npm run db:push
DATABASE_URL="your-prod-url" npm run db:seed
```

The `vercel.json` cron config is picked up automatically on Vercel Pro/Hobby plans.

---

## Trade-offs & What I'd Do Differently

**What I focused on:**
- Correctness of the reservation logic under concurrency (the Redis + PG FOR UPDATE double lock)
- Clean separation between the lock layer, the DB layer, and the HTTP layer
- Honest expiry handling with multiple strategies rather than pretending one is enough

**What I'd do with more time:**
- **Webhook-based payment simulation** — right now "confirm" is a button click. A real system would have a payment provider POST to a webhook, and the webhook handler would call `confirm`. This changes the UX significantly (polling for state changes).
- **Optimistic UI updates** — the product list refetches from the server after a reserve. With more time I'd update the stock counts in local state immediately for a snappier feel.
- **Idempotency record TTL** — the `IdempotencyRecord` table grows unbounded. A cron to purge records older than 24 hours is straightforward but I left it out.
- **Observability** — structured logging (Pino), Sentry error tracking, and a simple metrics counter for "reservations created / confirmed / released" would make this production-ready.
- **Tests** — I'd write integration tests for the reservation endpoint using a real test Postgres instance, specifically testing the concurrent path by firing two requests simultaneously with `Promise.all`.
- **Warehouse selection UX** — the current UI lets users pick a warehouse manually. A real system would auto-select the nearest or fastest-shipping warehouse based on the user's pincode.
