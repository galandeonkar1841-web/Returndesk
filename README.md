# ReturnDesk

A returns desk for a small online store. Customers want to return or replace something; a support agent raises a request, reviews it, approves or rejects it, picks a resolution (refund, replacement or store credit), leaves notes, and closes it out.

- **Deployed app:** _TODO: add the public URL here and in the GitHub repo description_
- **Time spent:** _TODO: write your real number of hours here_

## Stack

Next.js 16 (App Router) + React 19 + TypeScript · Next.js route handlers as the backend · PostgreSQL via `pg` (raw SQL, no ORM) · Tailwind CSS v4 · `zod` for input validation.

## Run it from a clean machine

You need Node 20+ and a PostgreSQL database (local, Docker, Neon, Supabase, Render, any).

```bash
git clone <this repo> && cd returndesk
npm install

cp .env.example .env          # then edit DATABASE_URL

# Optional: a throwaway local Postgres with Docker
# docker run -d --name rd-pg -e POSTGRES_USER=rd -e POSTGRES_PASSWORD=rd -e POSTGRES_DB=returndesk -p 5432:5432 postgres:16

npm run db:migrate            # builds the schema from empty
npm run db:seed               # 37 requests, every status and reason, 60 notes
npm run dev                   # http://localhost:3000
```

`npm run db:setup` runs migrate and seed together. The seed **wipes** `requests` and `notes` before inserting, so run it only on a database you are happy to reset. Migrations are tracked in a `schema_migrations` table, so `db:migrate` is safe to run repeatedly.

For a hosted Postgres that needs SSL (Neon, Supabase, Render) set `DATABASE_SSL=true`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `DATABASE_SSL` | `true` for hosted databases that require SSL |

Other scripts: `npm run build`, `npm run start`, `npm run lint`, and `npm run check:rules` (see Testing).

## Architecture

```
Browser (React, Tailwind)
   │ fetch
   ▼
app/api/**/route.ts        thin: parse input with zod, call the service, shape the response
   ▼
lib/services/requests.ts   business rules and transactions
   ▼
lib/db/requests.ts         parameterised SQL only
   ▼
PostgreSQL                 constraints, partial unique index, trigger: last line of defence
```

Key files:

- `lib/domain.ts` is the **only** place the lifecycle is defined (transition map, which statuses are editable, which are removable). The server enforces it; the UI only reads labels from it.
- `lib/http/errors.ts` and `lib/http/handler.ts` define one error type and a `route()` wrapper that turns every failure into the same JSON shape.
- `lib/validation.ts` holds the zod schemas, including the list-query schema and the sortable-column whitelist.
- `db/migrations/001_init.sql` is the schema.

## Data model

- **requests**: customer fields, `order_ref`, `item_ref`, `quantity`, `reason`/`status`/`resolution` as Postgres enums, `refund_amount NUMERIC(10,2)` (never a float), `deleted_at` for soft delete. `reference` (`RD-000042`) comes from a sequence default, so nobody can type it in.
- **notes**: `request_id` FK, `body`, `author`, `created_at`. A trigger blocks `UPDATE` and `DELETE`, so notes stay append-only even if someone bypasses the API.

Orders and items are plain reference fields, not separate tables. The brief only asks for requests, and a catalogue would add scope without adding anything to assess.

## Business rules and where they are enforced

| # | Rule | Service layer | Database |
|---|---|---|---|
| 1 | Status flow | `TRANSITIONS` map; anything else is `409 ILLEGAL_TRANSITION` | n/a |
| 2 | Approval needs a resolution | Checked in `transitionRequest`, `422 VALIDATION_ERROR` with the offending field | `CHECK` constraints `resolution_matches_status` and `refund_amount_matches_resolution` |
| 3 | One live request per item | Violation translated to `409 DUPLICATE_LIVE_REQUEST` (includes the blocking reference) | **Partial unique index** `(order_ref, item_ref) WHERE live`, so it is race-proof |
| 4 | Locked once decided | `409 REQUEST_LOCKED` on edit when Approved/Rejected/Completed; notes are exempt | n/a |
| 5 | Removal | Soft delete, only Open or Rejected, else `409 NOT_REMOVABLE`; removed rows return 404 | `deleted_at` |

Transitions, edits and removals run in a transaction with `SELECT … FOR UPDATE`, so two agents cannot change the same request at once.

## API

All responses are JSON, including 404s for unknown paths.

| Method and path | Purpose | Success |
|---|---|---|
| `GET /api/requests?q&status&reason&sort&order&page&pageSize` | List | 200 `{ data: [...], meta: { page, pageSize, total, totalPages } }` |
| `POST /api/requests` | Raise a request | 201 `{ data }` |
| `GET /api/requests/:id` | One request with all notes, oldest first | 200 |
| `PATCH /api/requests/:id` | Edit details | 200 |
| `POST /api/requests/:id/transition` | `{ to, resolution?, refundAmount? }` | 200 |
| `POST /api/requests/:id/notes` | Add a note | 201 |
| `DELETE /api/requests/:id` | Remove from the desk (soft) | 204 |

Every request in a response carries `allowedActions` (`transitions`, `canEdit`, `canRemove`), computed from the same rules the server enforces, so the UI just renders what it is told.

**Errors** always look like `{ "error": { "code": "...", "message": "...", "details": ... } }`:

| Status | Codes | Used for |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed JSON, non-numeric id |
| 404 | `NOT_FOUND` | Missing or removed request, unknown API path |
| 409 | `ILLEGAL_TRANSITION`, `DUPLICATE_LIVE_REQUEST`, `REQUEST_LOCKED`, `NOT_REMOVABLE` | The request is valid but conflicts with current state |
| 422 | `VALIDATION_ERROR` | Well-formed JSON with invalid values, with per-field `details` |
| 500 | `INTERNAL_ERROR` | Only for genuinely unexpected failures |

**Listing** is done entirely in SQL: `ILIKE` over customer name, email, order and reference (LIKE wildcards in the search term are escaped); status and reason filters; `ORDER BY` from a whitelist of columns with `id` as a tie-breaker so pages are stable; `LIMIT/OFFSET`; and a separate `count(*)` with the same `WHERE`.

## Frontend

- List with debounced search (300 ms), status and reason filters, sortable headers, and paging. Filter state lives in the URL, so a refresh or shared link keeps it.
- Status badges use colour **and** a text label.
- Loading skeleton, a clear empty state ("No requests match your search"), and an error banner with retry.
- Detail page shows only the actions the server lists in `allowedActions`. Approval opens an inline resolution form; the refund amount field appears only for Refund.
- Server refusals are shown verbatim, including field-level issues, and the page reloads after a 409 so it never shows stale state.
- Layout switches from table to cards below the `md` breakpoint (built for 375px).

## Decisions and assumptions

- **Reject only from In Review.** The brief's diagram is ambiguous. Rejecting is a decision made after review, and Open requests can already be removed, so I did not add Open → Rejected.
- **Notes are allowed on any non-removed request**, in any status, including closed ones.
- **A removed request frees its (order, item) slot**, because it no longer counts as live.
- **Editable fields:** everything except reference, status and resolution; In Review requests are still editable (only Approved, Rejected and Completed lock).
- **Currency** is shown as INR, since the brief does not say. Amounts are stored as plain `NUMERIC(10,2)`.
- **No authentication.** The brief has no login; the note author is a free-text field defaulting to "agent".
- **Raw SQL over an ORM** to keep the queries visible and reviewable.
- **System font stack** instead of Google Fonts, so the build needs no network access.

## Testing

`npm run check:rules` (with the server running) is a black-box script that calls the API directly and asserts all five rules, the status codes and error codes, and a combined search + filter + sort + paging query. At the time of writing it passes against both `next dev` and the production build. The database constraints were also checked directly with `psql` (illegal status update, duplicate live item, notes `UPDATE`/`DELETE`).

## What is not done

Be honest about these before the technical round:

- **Not deployed yet.** The code builds and runs, but I have not put it on a public URL. Deploy to Vercel with a Neon database, set `DATABASE_URL` and `DATABASE_SSL=true`, run `npm run db:setup` against it, then fill in the URL at the top of this file.
- **The UI has not been checked in a real browser at 375px.** The layout is written mobile-first and the pages return 200, but I have not looked at it on a device. Please do that check.
- **No automated unit or component tests**; only the API rule-check script.
- **Search uses `ILIKE '%term%'`**, which cannot use a normal index. Fine at this size; at scale I would add `pg_trgm` GIN indexes.
- **`OFFSET` paging** gets slower on very deep pages; keyset paging would be the next step.
- **No audit log of status changes** beyond `updated_at`; notes are the only history.
- **No optimistic-concurrency token** on edits (row locks prevent simultaneous writes, but a stale edit form can still overwrite newer details).
