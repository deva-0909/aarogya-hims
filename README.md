# Aarogya HIMS -- Angular + Supabase (Demo Mode: No Login)

**All 27 modules are now live.** This is the demo-mode version of the
Angular frontend: **there is no login screen**. Instead, a tab bar at the
top of the app lets you pick which role you're "viewing as," and the
sidebar updates instantly. This trades away real access control for zero
setup friction -- see the warning below before you point this at real
patient data.

## Required SQL migrations, in order

If you're setting this up fresh, or catching up an existing project, run
these in the Supabase SQL Editor **in this order**:

1. `supabase/schema.sql` -- all base tables
2. `supabase/demo-open-access.sql` -- opens up RLS to match no-login mode
3. `supabase/pharmacy_migration.sql` -- inventory uniqueness + seed stock
4. `supabase/quality_module_fix.sql` -- fixes a leftover `profiles`
   reference in patient safety incidents
5. `supabase/final_modules_migration.sql` -- tables for Specialty
   Departments, Physiotherapy, PR & Marketing, and My Workspace

All are safe to re-run (`IF NOT EXISTS` / `ON CONFLICT` throughout) if
you're not sure which you've already applied.

## How this differs from the authenticated version

- No `/login` route, no Supabase Auth calls anywhere in the app.
- No `profiles` table lookup, no per-user identity -- just a role label
  picked from the top tab bar (`src/app/core/role.service.ts`), stored in
  `localStorage` so it survives a refresh.
- Every module works off plain text / `staff_directory` references rather
  than `profiles` -- a few early modules (Purchase, Quality) originally
  referenced `profiles` from before login was removed; both were caught
  and fixed (see the migration files above).

## IMPORTANT -- read this before deploying anywhere real

Supabase's Row Level Security normally checks *who's signed in* to decide
what a request can do. With no login, there's no session for a policy to
check -- so this project ships with **`supabase/demo-open-access.sql`**,
which replaces all the role-based policies with fully open ones (any
request, from anyone with your URL, can read and write every table).

That means:
- **No real access control.** The role tabs are a UI convenience, not
  security -- nothing stops someone from opening browser dev tools and
  hitting Supabase directly as any "role."

- **No audit trail** of who registered which patient, who admitted whom, etc.
- This is fine for: local development, demos, internal testing with people
  you trust who have the link.
- This is **not** fine for: anything holding real patient data, or reachable
  by the general public.

If you later want real access control back, you'd reintroduce a login step
and re-apply the role-scoped policies already defined (but currently
superseded) in `supabase/schema.sql`.

## Setup

### 1. Supabase backend

If you haven't already run `supabase/schema.sql` against your project:
open Supabase's **SQL Editor**, paste its contents, run it. This creates
every table (patients, front desk, OPD, beds, billing, doctors, etc.).

**Then run `supabase/demo-open-access.sql`** (also in the SQL Editor) --
this is the step that makes the app usable without login. Skipping it means
every read/write from the frontend will be silently rejected by RLS.

Both scripts are safe to re-run if you're not sure whether you already ran
them.

### 2. Configure the frontend

Edit `src/environments/environment.ts` (and `environment.prod.ts` before
deploying) with your Supabase URL + anon key:
```ts
export const environment = {
  production: false,
  supabaseUrl: 'https://xxxx.supabase.co',
  supabaseAnonKey: 'eyJ...',
};
```

### 3. Install and run

```bash
npm install
npm start
```
Open **http://localhost:4200** -- you land directly on Front Office, no
login. Use the role tabs at the top to switch what the sidebar shows.

## Build & deploy

```bash
npm run build
```
Outputs to `dist/hims-angular/browser` -- deploy that folder to Vercel,
Netlify, or any static host, same as before. No auth-related environment
setup needed since there's no login flow.

## Project structure

```
src/
  environments/
    environment.ts / environment.prod.ts   # Supabase URL + anon key
  app/
    core/
      supabase.service.ts       # Supabase client (data only, no auth calls)
      role.service.ts           # current "viewing as" role, drives the tab bar
      modules.ts                 # module registry + role->module access matrix
      realtime-table.service.ts  # generic "watch a table live" helper
      doctors.ts                 # doctor dropdown filtering helpers
    layout/
      layout.component.ts       # sidebar + header + role tab bar + <router-outlet>
    shared/
      status-badge.component.ts
    pages/
      front-office/, opd/, ipd/, billing/   # live modules
      module-stub/                # placeholder for not-yet-built modules
    app.routes.ts                 # no login route, no guard
supabase/
  schema.sql                 # all tables + the ORIGINAL role-scoped policies
  demo-open-access.sql       # REQUIRED for demo mode -- opens up access
```

## Extending to the remaining modules

Same pattern as before: `schema.sql` has starter tables for every module in
the nav. Add its table name to the `demo_tables` array in
`demo-open-access.sql` if you want it open too, build a component following
`opd.component.ts` or `billing.component.ts`, and wire it into `LIVE_PAGES`
in `app.routes.ts`.
