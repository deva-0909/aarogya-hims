-- Final batch: Specialty Departments, Physiotherapy, PR & Marketing, My Workspace.
-- Run this in the Supabase SQL Editor. Safe to run even if some of these
-- tables partially exist -- everything uses IF NOT EXISTS / ON CONFLICT.
--
-- Note: none of these reference `profiles` (the unused auth table) --
-- learned that lesson from purchase_requisitions and patient_safety_incidents
-- earlier. Everything here uses plain text fields or references
-- staff_directory, consistent with the rest of the demo-mode schema.

-- Specialty Departments: inter-department referrals
create table if not exists specialty_referrals (
  id uuid primary key default gen_random_uuid(),
  patient text not null, mrn text,
  from_doctor text, to_department text not null,
  reason text,
  status text not null default 'Referred'
    check (status in ('Referred','Scheduled','Seen','Completed')),
  created_at timestamptz default now()
);
alter table specialty_referrals enable row level security;
drop policy if exists demo_open_access on specialty_referrals;
create policy demo_open_access on specialty_referrals for all using (true) with check (true);

-- Physiotherapy: session scheduling
create table if not exists physio_sessions (
  id uuid primary key default gen_random_uuid(),
  patient text not null, mrn text,
  therapist text, session_type text,
  scheduled_date date,
  status text not null default 'Scheduled'
    check (status in ('Scheduled','Completed','Cancelled','No-show')),
  notes text,
  created_at timestamptz default now()
);
alter table physio_sessions enable row level security;
drop policy if exists demo_open_access on physio_sessions;
create policy demo_open_access on physio_sessions for all using (true) with check (true);

-- PR & Marketing: campaign/event tracker
create table if not exists pr_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null default 'Health Camp'
    check (type in ('Health Camp','Press Release','Social Media','Community Event')),
  status text not null default 'Planned' check (status in ('Planned','Active','Completed')),
  start_date date, end_date date,
  notes text,
  created_at timestamptz default now()
);
alter table pr_campaigns enable row level security;
drop policy if exists demo_open_access on pr_campaigns;
create policy demo_open_access on pr_campaigns for all using (true) with check (true);

-- My Workspace (Employee Self-Service): hospital-wide notice board
create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text,
  posted_by text,
  created_at timestamptz default now()
);
alter table notices enable row level security;
drop policy if exists demo_open_access on notices;
create policy demo_open_access on notices for all using (true) with check (true);

insert into notices (title, body, posted_by) values
  ('Welcome to Aarogya HIMS', 'This notice board is visible to all staff via My Workspace. Post department updates, policy changes, or general announcements here.', 'Admin')
on conflict do nothing;
