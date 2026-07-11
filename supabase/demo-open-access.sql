-- ============================================================================
-- DEMO MODE: OPEN ACCESS POLICIES
-- ============================================================================
-- WARNING -- READ BEFORE RUNNING
--
-- This script REMOVES the role-based Row Level Security policies from
-- schema.sql and REPLACES them with fully open ones (any request, signed in
-- or not, can read and write every table below).
--
-- Why: the frontend no longer has a login step. The role tab bar at the top
-- of the app is a client-side-only preference -- nothing server-side
-- verifies it, because there's no Supabase session for a policy to inspect.
-- Real RLS policies (like the ones in schema.sql) check auth.uid() / the
-- signed-in user's role; with no sign-in, there's nothing for them to check,
-- so without this script every read/write from the app would simply be
-- denied.
--
-- WHAT THIS MEANS IN PRACTICE:
--   - Anyone with your deployed URL (and the public anon key, which is
--     always visible in frontend code -- that's normal and expected) can
--     read and write every row in every table listed below.
--   - There is no audit trail of who did what -- the app has no concept of
--     "who" beyond a label picked from a dropdown.
--   - This is appropriate for: local development, demos to stakeholders,
--     internal testing with trusted people who have the URL.
--   - This is NOT appropriate for: any deployment that will hold real
--     patient data, or that's reachable by anyone outside a trusted group.
--
-- TO GO BACK to real access control later: re-run the CREATE POLICY
-- statements from schema.sql for the tables below (they're still valid --
-- this script only replaces what's active, it doesn't delete schema.sql's
-- definitions from that file), and reintroduce a real login step in the
-- frontend so there's a session for those policies to check.
-- ============================================================================

do $$
declare
  r record;
  t text;
  demo_tables text[] := array[
    'patients', 'department_master', 'front_desk_registrations', 'opd_visits',
    'beds', 'admissions', 'invoices', 'payments', 'doctors',
    -- stub-module tables from schema.sql, opened up too for consistency
    -- if/when you wire those modules up
    'ed_visits', 'prescriptions', 'inventory_items', 'lab_orders',
    'radiology_orders', 'surgeries', 'icu_beds', 'blood_inventory',
    'blood_requests', 'insurance_claims', 'staff_directory', 'leave_requests',
    'patient_safety_incidents', 'ambulance_trips', 'purchase_requisitions',
    'role_module_access'
  ];
begin
  foreach t in array demo_tables loop
    -- Table might not exist if you haven't built that module's schema piece yet -- skip quietly.
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    -- Drop every existing policy on this table, regardless of name, so we
    -- don't end up with old restrictive policies still partially applying.
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', r.policyname, t);
    end loop;

    -- Replace with one fully-open policy. RLS stays ENABLED (so the table
    -- still requires a policy to grant access at all -- this one just grants
    -- it unconditionally), which makes it a one-line change to tighten later.
    execute format(
      'create policy demo_open_access on public.%I for all using (true) with check (true)',
      t
    );
  end loop;
end $$;
