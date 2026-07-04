# Sed_Ecomm — Server

Node.js/Express/TypeScript/MongoDB backend for the Sed_Ecomm e-commerce app.

## Stack

Express, TypeScript, Mongoose (MongoDB), JWT (access + refresh cookie), bcrypt, zod, helmet, cors,
express-rate-limit, express-mongo-sanitize, cookie-parser, morgan, multer.

## Local setup

1. Copy the example env file and fill in your own values:

   ```bash
   cp .env.example .env
   ```

   At minimum set `MONGODB_URI` to a MongoDB Atlas connection string, and generate long random
   values for `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the dev server (auto-restarts on file changes):

   ```bash
   npm run dev
   ```

4. Confirm it's up:

   ```
   http://localhost:5000/api/v1/health
   ```

   should return `{ "success": true, "message": "ok" }`.

## Scripts

| Script            | Description                                      |
| ----------------- | ------------------------------------------------- |
| `npm run dev`     | Run the API in watch mode via ts-node-dev          |
| `npm run build`   | Type-check and compile TypeScript to `dist/`       |
| `npm start`       | Run the compiled JS from `dist/` (production)      |
| `npm run seed`    | Run the database seeder (`src/seeders/seed.ts`)    |
| `npm run typecheck` | Type-check without emitting output               |

## Project structure

```
src/
  config/       # env loading, DB connection
  models/       # Mongoose schemas/models
  controllers/  # request handlers
  routes/       # Express routers, aggregated in routes/index.ts
  services/     # business logic, reusable across controllers
  middlewares/  # auth, validation, error handling, uploads
  utils/        # AppError, asyncHandler, response helpers
  validators/   # zod schemas
  seeders/      # database seed scripts
```

## Auth flow

- Access token: short-lived JWT (default 15m), returned in the response body, sent by the client
  as `Authorization: Bearer <accessToken>`.
- Refresh token: longer-lived JWT (default 7d), stored as an `httpOnly` cookie scoped to
  `/api/v1/auth`, secure + `SameSite=None` in production, `SameSite=Lax` in development.
- `POST /api/v1/auth/refresh-token` reads the refresh cookie and issues a new access token.

## Notes for later stages

- All routes are mounted under `/api/v1` via `src/routes/index.ts` — add new route modules there
  with `router.use('/products', productRoutes)`, etc.
- All Mongoose models referenced by the API contract already exist in `src/models/` with full
  TypeScript interfaces; business logic (controllers/services/routes) for anything beyond auth is
  intentionally left for later stages.
- `src/seeders/seed.ts` is a placeholder — fill in real seed data once product/category logic
  exists.
