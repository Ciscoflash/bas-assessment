# Loan origination → repayment

React + TypeScript frontend, Node (Fastify) backend, SQLite ledger. All money is integer kobo end to end.

```
backend/    Fastify API + SQLite ledger (source of truth)          → backend/.env
frontend/   Vite + React UI (previews and displays; never decides) → frontend/.env
parity/     cross-check: the frontend's money code vs the live backend API
```

Each side has its own money code: `backend/src/money` is authoritative; `frontend/src/money` is the browser's preview copy. `parity/` proves they agree to the kobo.

## Run

Requires Node 20.12+ (tested on 22).

```bash
npm install
cp backend/.env.example backend/.env       # already present locally; defaults work as-is
cp frontend/.env.example frontend/.env
npm run dev     # both: backend on :4000, frontend on http://localhost:5173
npm test        # every test: backend (money rules, API, services), frontend (UI, money copy), parity
```

Run one side only with `npm run dev:backend` or `npm run dev:frontend`.

Demo data (open loans with overdue instalments, an invoice, a past repayment):

```bash
npm run seed              # adds demo data if the database has no loans
npm run seed -- --reset   # wipes the database first (stop `npm run dev` before resetting)
```

> Always run `npm install` from the **project root**, not inside `backend/` or `frontend/`. This is an npm workspace: installing inside one folder installs only that folder and removes the other side's packages.

## Environment

**`backend/.env`** (validated at startup by `backend/src/config.ts`; a bad value stops the server with a clear message)

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `HOST`, `PORT` | `127.0.0.1`, `4000` | Where the API listens |
| `DB_PATH` | `./data/lending.db` | SQLite file, relative to `backend/`, or `:memory:` |
| `LOG_LEVEL` | `info` | Pino log level (`silent` to turn off) |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated origins allowed to call the API directly |
| `BUSINESS_UTC_OFFSET_MINUTES` | `60` | Business time zone (Lagos). Only affects "today" for display statuses |

**`frontend/.env`**

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | What the browser calls. `/api` uses the dev proxy; use an absolute URL for a separately hosted backend (and add the frontend origin to `CORS_ORIGINS`) |
| `FRONTEND_PORT` | `5173` | Vite dev server port (not exposed to the browser) |
| `API_PROXY_TARGET` | `http://127.0.0.1:4000` | Where the dev proxy forwards `/api` (not exposed to the browser) |

Only `.env.example` files are committed; real `.env` files are git-ignored. The dev database is `backend/data/lending.db`; delete it to start fresh.

## Backend layout (`backend/src`)

Each layer only talks to the one below it.

```
index.ts       process entry: load config, start listening
config.ts      reads + validates backend/.env
app.ts         builds the Fastify app (CORS, serializer, error handler, routes)
money/         money rules (authoritative): exact rationals, schedule, invoice, waterfall, payoff, posting rules, request schemas
routes/        HTTP only: validate input with the zod schemas in money/, call one service, return the result
http/          cross-cutting HTTP: error → response mapping, Idempotency-Key handling, bigint-safe JSON
services/      business rules + transaction boundaries (no SQL, no HTTP); index.ts wires everything together
repositories/  SQL only, prepared statements, rows → typed records (no business rules)
db/            connection, schema (append-only journal triggers), transaction helper
domain/        typed business errors (400/404/409/422, optionally tied to a form field)
```

## Frontend layout (`frontend/src`)

```
main.tsx, App.tsx   entry + routes
env.ts              typed access to VITE_* variables
money/              browser copy: schedule + invoice previews, form validation, formatting, response decoders
lib/api.ts          fetch wrapper: API base URL, Idempotency-Key header, server errors → form fields, decode kobo strings → bigint
pages/              Originate, LoanDetail (repay + payoff), Statement, Invoices, Ledger
components/         UI primitives + finance components (schedule, journal, allocation, tie-out, settlement)
```

See `NOTES.md` for the money contract, assumptions and what's out of scope.
