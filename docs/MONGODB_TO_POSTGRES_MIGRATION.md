# MongoDB → PostgreSQL Migration Runbook

**For:** any developer (including future-you) who needs to migrate this backend — or
one shaped like it — from **MongoDB + Mongoose** to **PostgreSQL + Prisma**, understand
_why_ each step exists, and repeat it safely.

This is a **real runbook**, not theory: every command, script, and rule below is what was
actually used to migrate the SedEcomm API. Read it top to bottom once before touching
anything.

---

## 1. TL;DR — the whole migration in 10 lines

1. **Back up** the Mongo database. Nothing here deletes Mongo, but assume it might.
2. **Add Prisma**, point it at a Postgres database (`DATABASE_URL` + `DIRECT_URL`).
3. **Write the Prisma schema** — translate each Mongo collection into a table, each
   embedded array into a child table, each `ObjectId` into a `uuid`.
4. **Run `prisma migrate`** to create the empty Postgres tables.
5. **Port the application code** service-by-service from Mongoose calls to Prisma calls,
   keeping every API response **byte-for-byte identical** so the frontend never changes.
6. **Check Mongo data integrity** (broken refs, duplicates, empty required fields).
7. **Copy the data** with one transactional ETL script (`migrate-mongo-to-pg.ts`).
8. **Verify** row counts match and run a full non-destructive end-to-end test.
9. **Seed** the baseline accounts (super admin, manager) so the server boots clean.
10. **Clean up** — delete the old Mongoose models, uninstall `mongoose`, drop `MONGODB_URI`.

If you only remember one rule: **the API contract is sacred.** The database underneath
changes; what the frontend receives does not.

---

## 2. The mental model (read this before the steps)

### Two separate swaps are happening at once

| Layer | Before | After |
|---|---|---|
| **Database** | MongoDB (documents) | PostgreSQL (relational tables) |
| **ORM / data layer** | Mongoose | Prisma |

They are independent ideas but we do them together. Mongo stores flexible JSON documents
with embedded sub-documents; Postgres stores rigid typed rows that reference each other by
foreign keys. Prisma is the type-safe client that talks to Postgres the way Mongoose talked
to Mongo.

### The core translation problem

Mongo lets a document **contain** its children:

```jsonc
// Mongo: a cart document OWNS its items inline
{ "_id": "...", "user": "...", "items": [ { "product": "...", "qty": 2 } ] }
```

Postgres cannot nest like that. The children must become **their own table** that points
back with a foreign key:

```
carts(id, user_id, ...)
cart_items(id, cart_id → carts.id, product_id, qty)   ← one row per item
```

So most of the work is: **embedded arrays → child tables**, and then **rebuilding the old
nested JSON shape in code** when you send a response, so the frontend still sees
`cart.items[...]`.

---

## 3. Key decisions & conversion rules (the "hard rules")

These are non-negotiable invariants. Every one exists to keep the frontend working unchanged.

| # | Rule | Why | How it's done |
|---|---|---|---|
| 1 | **API request/response shapes stay identical** | Frontend must need zero changes | Per-endpoint serializers rebuild the old shape |
| 2 | **Every entity includes `_id` (== `id`)** | Old Mongo clients key off `_id` | A recursive `toApi()` serializer adds `_id` from `id` on every object, including nested |
| 3 | **Prisma `Decimal` → plain number** | JSON had numbers, not `{ $numberDecimal }` | `toApi()` converts any `Prisma.Decimal` with `.toNumber()` |
| 4 | **Mongoose features are ported, not dropped** | Behaviour parity | bcrypt hashing, `select:false`→Prisma `omit`, slug auto-gen, product image transform |
| 5 | **`ObjectId` validation → UUID validation** | IDs are now UUIDs | `assertUuid()` throws the same `400`; bad sub-ids → `404` |
| 6 | **Mongo duplicate-key (`11000`) → Prisma `P2002`** | Same 409 error to the client | `errorHandler` maps `P2002` to the identical message |
| 7 | **Do NOT touch the frontend / client app** | It's a drop-in backend swap | All compatibility work lives in the server |

### Field-level conversions you will repeat constantly

| Mongo / Mongoose | Postgres / Prisma | Notes |
|---|---|---|
| `_id: ObjectId` | `id String @id @default(uuid()) @db.Uuid` | New UUIDs generated during data copy |
| `ref: 'User'` (ObjectId) | `userId String` + `@relation` | A real foreign key |
| Embedded array `items: [...]` | separate child table | e.g. `CartItem`, `OrderItem`, `ReviewLike` |
| Embedded object `variants: {sizes, colors}` | flat columns `sizes String[]`, `colors String[]` | Re-nested in code on the way out |
| `Decimal128` / `Number` price | `Decimal @db.Decimal(10,2)` | Returned as a JS `number` |
| `select: false` (password) | global Prisma `omit` | Opt back in with `omit: { password: false }` |
| enum-ish string field | Postgres `enum` | e.g. `UserRole`, `OrderStatus` |
| `.populate('user')` | Prisma `include: { user: true }` | Build a per-endpoint `include` to match old behaviour |

---

## 4. Prerequisites

- **Node.js** 18+ (for global `fetch`/`FormData` used by the test script).
- **A PostgreSQL database.** Managed (Prisma Postgres, Supabase, RDS…) or local. You need
  two connection strings:
  - `DATABASE_URL` — what the app uses at runtime (may go through a pooler).
  - `DIRECT_URL` — a **direct** (non-pooled) connection. Migrations and the bulk data
    import use this, because they open long transactions a pooler can cut off.
- **Access to the source Mongo database** (`MONGODB_URI`), read access is enough.
- The repo checked out on a **dedicated branch** (here: `postgres-migration`).

---

## 5. Step-by-step runbook

> Convention below: ⚙️ = one-time setup, ▶️ = a command you run, ⚠️ = a safety gate.

### Step 0 — Prepare & back up ⚠️

```bash
# Back up Mongo first. The migration never writes to Mongo, but be safe.
mongodump --uri="$MONGODB_URI" --out=./mongo-backup-$(date +%F)

git checkout -b postgres-migration
```

### Step 1 — Install & initialise Prisma ⚙️

```bash
npm install prisma @prisma/client @prisma/adapter-pg
npx prisma init
```

This project uses **Prisma 7 with the driver-adapter API** and generates the client into
the repo (not `node_modules`). Key config:

- `prisma/schema.prisma` — generator outputs to `../src/generated/prisma`:
  ```prisma
  generator client {
    provider = "prisma-client"
    output   = "../src/generated/prisma"
  }
  datasource db {
    provider = "postgresql"
  }
  ```
- A single shared client in [`src/config/prisma.ts`](../src/config/prisma.ts) wires the pg
  adapter **and declares the global `omit`** (this replaces Mongoose `select: false`):
  ```ts
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  export const prisma = new PrismaClient({
    adapter,
    omit: { user: { password: true, passwordResetToken: true, passwordResetExpires: true } },
  });
  ```
- The generated client (`src/generated/prisma`) is **git-ignored** and recreated by
  `npx prisma generate`. Never edit it by hand.

### Step 2 — Write the Prisma schema (the translation) ⚙️

Open [`prisma/schema.prisma`](../prisma/schema.prisma). For every Mongo collection, write a
`model`. The rules from §3 apply. The decisions that matter most:

- **Embedded arrays become models.** `Cart.items` → `CartItem`; `Order.items` →
  `OrderItem`; `Order.trackingTimeline` → `OrderTrackingEvent`; `Review.likes` →
  `ReviewLike`; `Wishlist.products` → `WishlistItem`.
- **Join tables get composite keys** so they stay idempotent:
  `@@id([reviewId, userId])`, `@@id([wishlistId, productId])`.
- **Referential actions matter** — they decide what happens on delete. Example choices used
  here: `OrderItem.productId` is `onDelete: SetNull` (keep the order if a product is
  deleted); `Address`→`User` is `onDelete: Cascade`; `Payment`→`Order` is `Restrict`.
- **Enums** for every fixed string set (`UserRole`, `OrderStatus`, `PaymentMethod`,
  `CouponType`, `ChangeModule`, `ChangeAction`, `ChangeStatus`, …).

### Step 3 — Create the tables ▶️

```bash
# Generates SQL migrations and applies them to the DB in DATABASE_URL.
npx prisma migrate dev --name init
npx prisma generate      # (re)build the typed client
```

The committed migrations live in [`prisma/migrations/`](../prisma/migrations/). On a fresh
production database you apply them with:

```bash
npx prisma migrate deploy
```

### Step 4 — Port the application code 🧩

This is the biggest chunk. Work **service by service**. For each one, replace Mongoose
calls with Prisma calls, then pass the result through the serializer so the response shape
is unchanged. The reusable pieces (build these first):

| Helper | File | Job |
|---|---|---|
| `toApi(value)` | [`src/utils/serialize.ts`](../src/utils/serialize.ts) | Recursively add `_id`, convert `Decimal`→number, keep dates, recurse arrays/objects |
| `assertUuid` / `isUuid` | [`src/utils/uuid.ts`](../src/utils/uuid.ts) | Replace `ObjectId.isValid`; same 400/404 behaviour |
| `uniqueSlug` / `slugify` | [`src/utils/slug.ts`](../src/utils/slug.ts) | Port the Mongoose `pre('validate')` slug hook (`-2`, `-3` suffixes) |
| `toClientImages` | [`src/utils/productImage.ts`](../src/utils/productImage.ts) | Turn `string[]` image paths into `{ id, url }` with absolute URLs |
| `hashPassword` / `comparePassword` | [`src/services/user.service.ts`](../src/services/user.service.ts) | bcrypt, replacing the Mongoose password hooks |

Then, per service, the pattern is always the same:

```ts
// 1. Query with Prisma, using `include` to match the old `.populate(...)`
const order = await prisma.order.findUnique({
  where: { id },
  include: { items: true, trackingEvents: true, shippingAddress: true, user: true },
});
// 2. Rebuild the old nested shape (variants, trackingTimeline, etc.)
// 3. Run it through toApi() so every object gets `_id` and numbers are plain
return serializeOrder(order);
```

Also update: **validators** (`z.string().uuid()` instead of ObjectId checks),
**middlewares** (`auth.middleware` loads the user via Prisma), and the **error handler**
(map `P2002` → the old 409 message). See the commit
`Migrate all services from Mongoose to Prisma/Postgres` for the full set.

### Step 5 — Migrate the DATA ⚠️▶️

> **Caveat:** the data scripts below still `import mongoose` and read `MONGODB_URI`.
> The cleanup in Step 8 **uninstalls mongoose**, so to (re-)run a data migration you must
> temporarily reinstall it: `npm install mongoose` and ensure `MONGODB_URI` is set. Remove
> it again afterward.

**5a. Integrity check (read-only).** Find problems Postgres will reject *before* you try to
insert — broken references, duplicate values on soon-to-be-`UNIQUE` columns, empty
`NOT NULL` fields:

```bash
npx ts-node scripts/check-mongo-integrity.ts
```
Fix or accept every `❌` it prints. (The ETL will *skip* rows with broken required refs and
tell you how many — that's expected for genuinely orphaned data.)

**5b. Dry run (reads Mongo, writes nothing).** Prints exactly how many rows would land in
each table:

```bash
npx ts-node scripts/migrate-mongo-to-pg.ts --dry
```

**5c. Real import.** One **all-or-nothing transaction** into Postgres:

```bash
npx ts-node scripts/migrate-mongo-to-pg.ts
```

How [`migrate-mongo-to-pg.ts`](../scripts/migrate-mongo-to-pg.ts) works, so you trust it:
- Loads every collection, then **assigns a fresh UUID to every document up front** and keeps
  a `ObjectId → UUID` map. This is how old references (`order.user`, `cart.items.product`)
  get rewritten to the new UUIDs consistently.
- Transforms **parents before children**; flattens embedded arrays into child-table rows;
  converts Decimals with `Number(...)`; copies timestamps (falling back to the ObjectId's
  own creation time).
- **Refuses to run if Postgres already has users** (`count > 0`) — so you can never
  double-import.
- Inserts everything inside `prisma.$transaction(...)`. If any insert fails, **nothing** is
  written.
- On success writes `scripts/id-map.json` (the full ObjectId→UUID map) for auditing.
- Uses `DIRECT_URL` (not the pooled `DATABASE_URL`) because the import is one long
  transaction.

### Step 6 — Verify the copy ▶️

```bash
npx ts-node scripts/count-pg.ts     # row counts per Postgres table
```
Compare against the dry-run plan and against Mongo's own counts. They should match (minus
any rows the integrity step told you were legitimately orphaned).

### Step 7 — Seeders (boot-time baseline) ⚙️▶️

The server seeds a few accounts idempotently on boot so it always starts in a usable state.
These were ported to Prisma too:

```bash
npm run ensure-superadmin   # creates/ensures the super-admin account
npm run ensure-manager      # creates/ensures the manager account
npm run fix-images          # (optional) re-point product images to in-category pools
npm run seed                # ⚠️ DESTRUCTIVE: wipes catalog + txn data, recreates demo data
```

⚠️ `npm run seed` is for a **fresh/demo** database only — it deletes products, orders, carts,
payments, reviews and recreates ~110 demo products. **Never run it on a database that holds
real migrated data.** `ensure-*` and `fix-images` are safe (non-destructive).

### Step 8 — Full end-to-end verification ▶️

Boot the server and exercise the whole journey, **non-destructively** (every created row is
rolled back afterward):

```bash
npm run dev        # starts on PORT (default 5001 here)
# then run your E2E script against http://localhost:<PORT>/api/v1
```

The round that was run here covered, end to end: register/login → browse products &
categories → wishlist → cart (add/update/coupon/totals) → create order (stock decrement) →
card payment + OTP → order detail/invoice/track → review create/like/delete → admin
dashboard/orders/customers/status-update/refunds → error mapping (duplicate → 409, bad UUID
→ 400). **55/55 checks passed with the database restored to its exact baseline.**

What a good E2E asserts (the invariants from §3):
- every entity has `_id === id`,
- `price`/`total`/`subtotal` are **numbers**, not Decimal objects,
- product images are `{ id, url }`,
- `variants` is nested `{ sizes, colors }`,
- populated relations (`order.user`, `order.shippingAddress`) are **objects with `_id`**,
- stock actually decrements on order; it restores on rollback.

### Step 9 — Clean up Mongoose ⚙️

Only after everything above passes:

```bash
# 1. Delete the old Mongoose model files (src/models/*).
# 2. Repoint any `import type { X } from '../models/...'` to the generated Prisma client
#    (UserRole, ChangeModule, ... are all Prisma enums now).
# 3. Remove the last dead Mongoose branches (e.g. in the error handler).
# 4. Drop MONGODB_URI from the required env list.
npm uninstall mongoose
npm run typecheck      # must be clean
npm run build          # must emit clean
```

Confirm nothing in `src/` imports `mongoose` or `../models/` anymore.

---

## 6. Scripts reference

| Script | Command | Writes? | Purpose |
|---|---|---|---|
| [`scripts/check-mongo-integrity.ts`](../scripts/check-mongo-integrity.ts) | `npx ts-node scripts/check-mongo-integrity.ts` | ❌ read-only | Flags broken refs, duplicates, empty required fields **before** import |
| [`scripts/migrate-mongo-to-pg.ts`](../scripts/migrate-mongo-to-pg.ts) | `… migrate-mongo-to-pg.ts [--dry]` | ⚠️ one transaction | The ETL. `--dry` reads only. Refuses to run if PG already has users |
| [`scripts/count-pg.ts`](../scripts/count-pg.ts) | `npx ts-node scripts/count-pg.ts` | ❌ read-only | Row counts per Postgres table, to verify the copy |
| `npm run ensure-superadmin` / `ensure-manager` | — | ✅ idempotent | Baseline accounts; safe to re-run |
| `npm run fix-images` | — | ✅ in-place | Re-point product images; preserves IDs/orders |
| `npm run seed` | — | ⚠️ **destructive** | Fresh demo data only — wipes catalog + txn tables |

---

## 7. Environment variables

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | the app + `count-pg` | Runtime connection; may be pooled |
| `DIRECT_URL` | migrations + the ETL | **Direct** (non-pooled) connection for long transactions |
| `MONGODB_URI` | the data scripts only | Source Mongo. Removed from the app's required list in Step 8 |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | app | Required |
| `PORT`, `NODE_ENV`, `CLIENT_URL`, `PUBLIC_URL` | app | `PUBLIC_URL` turns local upload paths into absolute image URLs |

---

## 8. Verification checklist (sign-off)

- [ ] `check-mongo-integrity` reviewed; every `❌` fixed or consciously accepted.
- [ ] `--dry` plan looks right (counts ≈ Mongo counts).
- [ ] ETL committed; `id-map.json` produced.
- [ ] `count-pg` matches the plan.
- [ ] `npm run typecheck` and `npm run build` are clean.
- [ ] Server boots with **no** `MONGODB_URI` set and no Mongoose errors in the log.
- [ ] Full E2E passes; database restored to baseline (zero test footprint).
- [ ] No `mongoose` / `../models/` imports remain in `src/`.

---

## 9. Rollback plan

The migration is **additive and non-destructive to Mongo** — the old database is untouched,
so rollback is simply: point the app back at the Mongoose codebase (previous branch/commit)
and the Mongo `MONGODB_URI`. Because you have a `mongodump` backup (Step 0) and the Postgres
import is one transaction, there is no half-migrated state to untangle. If the Postgres
import fails, nothing was written; fix the cause and re-run.

---

## 10. Gotchas & lessons learned (save yourself hours)

- **P2002 has no `meta.target` under the pg driver adapter.** To recover the offending
  column you must parse `meta.driverAdapterError.cause.constraint.index` (minus the table
  prefix and the `_key`/`_pkey` suffix). See [`errorHandler`](../src/middlewares/errorHandler.ts).
- **`populate` vs id string is per-endpoint.** Some old endpoints returned a populated
  object, others a bare id. Don't globally `include` everything — match each endpoint, or
  you change the response shape.
- **Decimal is sneaky.** A `Prisma.Decimal` serializes to a weird object in JSON. If a
  number "looks wrong" on the client, you forgot to run that field through `toApi()`.
- **Delete order matters in Postgres.** `Restrict` foreign keys block a parent delete while
  children exist. When wiping (e.g. in `seed.ts`) delete children first (payments → orders,
  products → categories), and for the self-referencing category tree delete child rows
  before parents.
- **`select: false` is now global `omit`.** To read a password for login you must explicitly
  opt back in: `prisma.user.findUnique({ omit: { password: false } })`.
- **Type-only imports can secretly load Mongoose.** An `import { X }` (without `type`) from a
  model file pulls the whole Schema at runtime. Use `import type`, or better, import enums
  from the generated Prisma client.
- **The data scripts depend on mongoose**, which Step 8 removes — reinstall it temporarily if
  you ever re-run a migration (see Step 5 caveat).
- **Test data can have admin block-flags.** When writing an E2E test, a product may carry
  `blockAddToCart` and legitimately return 400 — pick an unblocked, in-stock product, or you
  will chase a "bug" that is the feature working.
- **Postgres text search ≠ Mongo `$text`.** Searches became `contains`/array `has` with no
  relevance ranking, and array filters are case-sensitive. Acceptable here, but know it
  changed.

---

*Last updated: 2026-11-04. Migration performed on branch `postgres-migration`.*
