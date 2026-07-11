-- Quality module fix -- run this in the Supabase SQL Editor if I wasn't
-- able to apply it directly (Supabase MCP connection dropped mid-build).
--
-- patient_safety_incidents.reported_by was set up to reference the
-- `profiles` table, which is unused in demo mode (no login). The Quality
-- module's frontend instead writes to a new `reported_by_name` text column.
-- This is the same class of issue we found and fixed in purchase_requisitions
-- earlier -- any leftover reference to `profiles` from before login was
-- removed needs the same treatment.

alter table patient_safety_incidents add column if not exists reported_by_name text;

-- Confirm demo_open_access policy covers this table (should already be
-- there from your earlier demo-open-access.sql run, but safe to reapply):
drop policy if exists demo_open_access on patient_safety_incidents;
create policy demo_open_access on patient_safety_incidents for all using (true) with check (true);
