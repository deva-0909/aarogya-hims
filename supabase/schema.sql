-- ============================================================================
-- Aarogya HIMS — Supabase schema
-- Run this in the Supabase SQL editor (or `supabase db push` with the CLI).
-- Organized in the same build order as the README:
--   1. Auth / roles
--   2. Core registry (patients)
--   3. Live modules (Front Office, OPD, IPD/beds, Billing)
--   4. Stub tables for every remaining module (uncomment/extend as you build them)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AUTH / ROLES
-- ----------------------------------------------------------------------------

create table if not exists profiles (
  id uuid references auth.users primary key,
  full_name text not null,
  role text not null check (role in (
    'superadmin','admin','doctor','nurse','reception','pharmacist',
    'labtech','pathologist','radiologist','accountant','hr','hod','employee'
  )),
  title text,
  department text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "users can read all profiles"
  on profiles for select
  using ( auth.role() = 'authenticated' );

create policy "users can update their own profile"
  on profiles for update
  using ( auth.uid() = id );

-- Auto-create a profile row whenever a new auth user signs up.
-- Default role is 'employee' — promote via the Supabase dashboard or an
-- admin screen (see README's role_module_access note).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'employee');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Supabase does NOT put your custom `role` column into the auth JWT by
-- default (that needs a custom Auth Hook, which is extra setup). Every RLS
-- policy below instead calls this small helper, which looks the caller's
-- role up from `profiles` on every check. `security definer` + `stable` lets
-- Postgres do this cheaply and lets the function read `profiles` even though
-- the calling role's own RLS policy on `profiles` might otherwise restrict it.
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Optional: a role -> module lookup table so the Super Admin can manage
-- access from an admin screen instead of it being hardcoded (README ask).
create table if not exists role_module_access (
  role text not null,
  module_id text not null,
  primary key (role, module_id)
);
alter table role_module_access enable row level security;
create policy "authenticated users can read module access"
  on role_module_access for select using ( auth.role() = 'authenticated' );

-- ----------------------------------------------------------------------------
-- 2. CORE REGISTRY
-- ----------------------------------------------------------------------------

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  mrn text unique default ('MRN-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0')),
  name text not null,
  age int,
  sex text,
  phone text,
  dept text,
  doctor text,
  type text, -- New / Follow-up / IPD / Emergency
  token text,
  status text,
  created_at timestamptz default now()
);
alter table patients enable row level security;
create policy "clinical + front-office roles can read patients"
  on patients for select
  using ( auth.role() = 'authenticated' ); -- tighten per NABH/HIPAA note in README once care-relationship logic exists
create policy "front office / reception can insert patients"
  on patients for insert
  with check ( auth.role() = 'authenticated' );
create policy "clinical roles can update patients"
  on patients for update
  using ( auth.role() = 'authenticated' );

create table if not exists department_master (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  specialty boolean default false,
  active boolean default true
);
alter table department_master enable row level security;
create policy "authenticated read department_master"
  on department_master for select using ( auth.role() = 'authenticated' );
create policy "superadmin write department_master"
  on department_master for all
  using ( public.current_user_role() = 'superadmin' )
  with check ( public.current_user_role() = 'superadmin' );

-- ----------------------------------------------------------------------------
-- 3. LIVE MODULES: Front Office, OPD, IPD/Beds, Billing
-- ----------------------------------------------------------------------------

create table if not exists front_desk_registrations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id),
  token text not null,
  name text not null,
  age int,
  sex text,
  type text,
  dept text,
  doctor text,
  status text default 'Waiting', -- Waiting / In Consultation / Billing / Completed
  wait int default 0,
  created_at timestamptz default now()
);
alter table front_desk_registrations enable row level security;
create policy "reception/admin read+write front desk"
  on front_desk_registrations for all
  using ( public.current_user_role() in ('reception','admin','superadmin') )
  with check ( public.current_user_role() in ('reception','admin','superadmin') );
create policy "clinical roles read front desk"
  on front_desk_registrations for select
  using ( public.current_user_role() in ('doctor','nurse','reception','admin','superadmin') );

create table if not exists opd_visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id),
  token text not null,
  name text not null,
  age int,
  sex text,
  dept text,
  doctor text,
  in_time text,
  wait int default 0,
  status text default 'Waiting', -- Waiting -> Called -> In Consultation -> Completed
  created_at timestamptz default now()
);
alter table opd_visits enable row level security;
create policy "role can read own module data"
  on opd_visits for select
  using ( public.current_user_role() in ('doctor','nurse','reception','admin','superadmin') );
create policy "doctor/nurse/reception can update opd status"
  on opd_visits for update
  using ( public.current_user_role() in ('doctor','nurse','reception','admin','superadmin') );
create policy "reception/admin can insert opd visits"
  on opd_visits for insert
  with check ( public.current_user_role() in ('reception','admin','superadmin') );

create table if not exists beds (
  id uuid primary key default gen_random_uuid(),
  ward text not null,
  label text not null,
  status text not null default 'available', -- available / occupied / reserved / cleaning
  patient text,
  mrn text,
  age int,
  sex text,
  dx text,
  consultant text,
  unique (ward, label)
);
alter table beds enable row level security;
create policy "clinical roles read beds"
  on beds for select
  using ( public.current_user_role() in ('doctor','nurse','admin','superadmin','hod') );
create policy "doctor/nurse/admin can update beds"
  on beds for update
  using ( public.current_user_role() in ('doctor','nurse','admin','superadmin') );

create table if not exists admissions (
  id uuid primary key default gen_random_uuid(),
  bed_id uuid references beds(id),
  patient_name text not null,
  mrn text,
  age int,
  sex text,
  dx text,
  consultant text,
  ward text,
  bed_label text,
  admission_type text,
  bed_class text,
  mlc boolean default false,
  attendant text,
  payment_type text, -- Cash / Insurance / Corporate
  admitted_at timestamptz default now(),
  discharged_at timestamptz
);
alter table admissions enable row level security;
create policy "clinical roles read admissions"
  on admissions for select
  using ( public.current_user_role() in ('doctor','nurse','admin','superadmin') );
create policy "doctor/nurse/admin can insert admissions"
  on admissions for insert
  with check ( public.current_user_role() in ('doctor','nurse','admin','superadmin') );

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  patient text not null,
  mrn text,
  dept text,
  items jsonb not null default '[]', -- [{d: description, amt: number}]
  paid numeric default 0,
  payer text default 'Cash',
  status text default 'Unpaid', -- Unpaid / Partial / Paid
  created_at timestamptz default now()
);
alter table invoices enable row level security;
create policy "billing roles read+write invoices"
  on invoices for all
  using ( public.current_user_role() in ('reception','accountant','admin','superadmin') )
  with check ( public.current_user_role() in ('reception','accountant','admin','superadmin') );

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id),
  patient text,
  mode text, -- Cash / UPI / Card / Insurance-TPA
  amount numeric not null,
  created_at timestamptz default now()
);
alter table payments enable row level security;
create policy "billing roles read+write payments"
  on payments for all
  using ( public.current_user_role() in ('reception','accountant','admin','superadmin') )
  with check ( public.current_user_role() in ('reception','accountant','admin','superadmin') );

-- ----------------------------------------------------------------------------
-- 4. SUGGESTED TABLES FOR REMAINING MODULES (per README §"Suggested Supabase Schema")
--    Field lists are sketched from the DC file's seed arrays. Extend these as
--    you wire up each module's page — copy the field-list pattern above
--    (create table -> enable RLS -> role-scoped policies).
-- ----------------------------------------------------------------------------

-- Emergency
create table if not exists ed_visits (
  id uuid primary key default gen_random_uuid(),
  patient text, age text, sex text, complaint text,
  triage text check (triage in ('red','yellow','green')),
  hr int, bp text, spo2 int, temp numeric,
  wait int default 0, doctor text, mlc boolean default false,
  status text not null default 'Triage'
    check (status in ('Triage','In Treatment','Disposition Pending','Closed')),
  disposition text, -- Admit / Discharge / Refer / Observation / LAMA / Death
  created_at timestamptz default now()
);
alter table ed_visits enable row level security;
create policy "ed roles read+write ed_visits" on ed_visits for all
  using ( public.current_user_role() in ('doctor','nurse','admin','superadmin') )
  with check ( public.current_user_role() in ('doctor','nurse','admin','superadmin') );

-- Pharmacy
create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient text, mrn text, prescriber text, ward text,
  status text default 'Queued', -- Queued -> Verifying -> Ready -> Dispensed
  priority text default 'Routine',
  allergy text,
  items jsonb default '[]', -- [{drug, dose, freq, dur}]
  created_at timestamptz default now()
);
alter table prescriptions enable row level security;
create policy "pharmacy/doctor roles" on prescriptions for all
  using ( public.current_user_role() in ('pharmacist','doctor','admin','superadmin') )
  with check ( public.current_user_role() in ('pharmacist','doctor','admin','superadmin') );

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, stock int default 0, max int, reorder int,
  mrp numeric, cost numeric, schedule text, batches jsonb default '[]',
  category text not null default 'Medicine'
    check (category in ('Medicine','Consumable','Equipment','Surgical','Other'))
);
alter table inventory_items enable row level security;
create policy "pharmacy/inventory roles" on inventory_items for all
  using ( public.current_user_role() in ('pharmacist','admin','superadmin') )
  with check ( public.current_user_role() in ('pharmacist','admin','superadmin') );

-- Starter inventory so the Pharmacy module's stock panel and drug-name
-- autocomplete aren't empty on first run. Edit freely to match your
-- real formulary.
insert into inventory_items (name, stock, max, reorder, mrp, schedule) values
  ('Paracetamol 500mg',       800, 1000, 150, 2.50,  null),
  ('Amoxicillin 500mg',       320, 500,  100, 6.00,  'H'),
  ('Azithromycin 500mg',      140, 300,  80,  18.00, 'H'),
  ('Ibuprofen 400mg',         600, 800,  120, 3.00,  null),
  ('Pantoprazole 40mg',       450, 600,  100, 5.50,  null),
  ('Metformin 500mg',         500, 700,  150, 2.00,  null),
  ('Amlodipine 5mg',          380, 500,  100, 3.50,  null),
  ('Atorvastatin 20mg',       310, 500,  100, 6.50,  null),
  ('Cefixime 200mg',          90,  300,  100, 22.00, 'H'),
  ('Ondansetron 4mg',         220, 400,  80,  4.00,  null),
  ('Insulin Glargine 100IU',  35,  100,  40,  450.00,'H'),
  ('Salbutamol Inhaler',      60,  150,  50,  180.00,null)
on conflict (name) do nothing;

-- Laboratory
create table if not exists lab_orders (
  id uuid primary key default gen_random_uuid(),
  patient text, mrn text, test text, sample text, priority text,
  ordering_doctor text,
  stage text default 'Registered', -- Registered -> Sample Collected -> In Process -> Reported -> Validated
  dept text, price numeric, results jsonb default '[]',
  critical boolean not null default false,
  created_at timestamptz default now()
);
alter table lab_orders enable row level security;
create policy "lab roles" on lab_orders for all
  using ( public.current_user_role() in ('labtech','pathologist','doctor','admin','superadmin') )
  with check ( public.current_user_role() in ('labtech','pathologist','doctor','admin','superadmin') );

-- Radiology
create table if not exists radiology_orders (
  id uuid primary key default gen_random_uuid(),
  patient text, mrn text, scan text, modality text, room text, priority text,
  ordering_doctor text,
  stage text default 'Registered', -- Registered -> Scheduled -> Acquired -> Reported -> Verified
  dept text, contrast boolean default false, egfr int, contrast_allergy boolean default false,
  price numeric, critical boolean default false, report text,
  created_at timestamptz default now()
);
alter table radiology_orders enable row level security;
create policy "radiology roles" on radiology_orders for all
  using ( public.current_user_role() in ('radiologist','doctor','admin','superadmin') )
  with check ( public.current_user_role() in ('radiologist','doctor','admin','superadmin') );

-- OT / Surgery
create table if not exists surgeries (
  id uuid primary key default gen_random_uuid(),
  scheduled_time text, patient text, procedure text, surgeon text, anaesthetist text,
  ot text, type text, anaesthesia text, priority text,
  status text default 'Scheduled', -- Scheduled -> Sent to OT -> In Progress -> Completed -> In Recovery
  consent boolean default false,
  checklist jsonb default '{"signin":false,"timeout":false,"signout":false}',
  postop_notes text,
  created_at timestamptz default now()
);
alter table surgeries enable row level security;
create policy "ot roles" on surgeries for all
  using ( public.current_user_role() in ('doctor','nurse','admin','superadmin') )
  with check ( public.current_user_role() in ('doctor','nurse','admin','superadmin') );

-- ICU
create table if not exists icu_beds (
  id uuid primary key default gen_random_uuid(),
  bed text unique, patient text, mrn text, dx text, consultant text, nurse text,
  status text not null default 'available' check (status in ('available','occupied')),
  acuity text, hr int, bp text, spo2 int, rr int, temp numeric,
  ventilated boolean default false, vent_settings text, apache int,
  fasthug jsonb default '{}'
);
alter table icu_beds enable row level security;
create policy "icu roles" on icu_beds for all
  using ( public.current_user_role() in ('doctor','nurse','admin','superadmin') )
  with check ( public.current_user_role() in ('doctor','nurse','admin','superadmin') );

insert into icu_beds (bed, status) values
  ('ICU-01', 'available'), ('ICU-02', 'available'), ('ICU-03', 'available'),
  ('ICU-04', 'available'), ('ICU-05', 'available'), ('ICU-06', 'available')
on conflict (bed) do nothing;

-- Blood Bank
create table if not exists blood_inventory (
  id uuid primary key default gen_random_uuid(),
  blood_group text unique, units int default 0, min_threshold int default 0
);
create table if not exists blood_requests (
  id uuid primary key default gen_random_uuid(),
  patient text, mrn text, blood_group text, component text, units int,
  priority text, stage text default 'Requested', ward text, indication text,
  requested_by text,
  created_at timestamptz default now()
);
alter table blood_inventory enable row level security;
alter table blood_requests enable row level security;
create policy "bloodbank roles inv" on blood_inventory for all
  using ( public.current_user_role() in ('labtech','pathologist','admin','superadmin') )
  with check ( public.current_user_role() in ('labtech','pathologist','admin','superadmin') );
create policy "bloodbank roles req" on blood_requests for all
  using ( public.current_user_role() in ('labtech','pathologist','doctor','admin','superadmin') )
  with check ( public.current_user_role() in ('labtech','pathologist','doctor','admin','superadmin') );

insert into blood_inventory (blood_group, units, min_threshold) values
  ('A+', 24, 10), ('A-', 8, 5), ('B+', 20, 10), ('B-', 6, 5),
  ('AB+', 10, 5), ('AB-', 3, 3), ('O+', 30, 15), ('O-', 9, 8)
on conflict (blood_group) do nothing;

-- Insurance / TPA
create table if not exists insurance_claims (
  id uuid primary key default gen_random_uuid(),
  patient text, mrn text, insurer text, policy_no text, tpa text,
  sum_insured numeric, claim_amount numeric, approved_amount numeric,
  procedure text,
  stage text default 'Pre-Auth', -- Pre-Auth -> Submitted -> Query -> Approved/Rejected -> Settled
  tpa_thread jsonb default '[]',
  created_at timestamptz default now()
);
alter table insurance_claims enable row level security;
create policy "insurance roles" on insurance_claims for all
  using ( public.current_user_role() in ('accountant','reception','admin','superadmin') )
  with check ( public.current_user_role() in ('accountant','reception','admin','superadmin') );

-- HR (subset — extend with attendance, payroll_runs, credentials, appraisals, etc.)
create table if not exists staff_directory (
  id uuid primary key default gen_random_uuid(),
  full_name text, role text, department text, title text, phone text, email text
);
create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_directory(id),
  leave_type text, start_date date, end_date date,
  status text default 'Pending', -- Pending -> Approved / Rejected
  created_at timestamptz default now()
);
alter table staff_directory enable row level security;
alter table leave_requests enable row level security;
create policy "hr roles staff" on staff_directory for all
  using ( public.current_user_role() in ('hr','admin','superadmin') )
  with check ( public.current_user_role() in ('hr','admin','superadmin') );
create policy "employee reads/writes own leave" on leave_requests for all
  using ( public.current_user_role() in ('hr','admin','superadmin') or staff_id = auth.uid() )
  with check ( public.current_user_role() in ('hr','admin','superadmin') or staff_id = auth.uid() );

insert into staff_directory (full_name, role, department, title, phone, email) values
  ('Sunita Rao', 'nurse', 'Nursing', 'Staff Nurse', '9820011001', 'sunita.rao@hospital.org'),
  ('Manoj Pillai', 'nurse', 'ICU', 'ICU Nurse', '9820011002', 'manoj.pillai@hospital.org'),
  ('Kavya Menon', 'reception', 'Front Office', 'Receptionist', '9820011003', 'kavya.menon@hospital.org'),
  ('Ramesh Patil', 'pharmacist', 'Pharmacy', 'Pharmacist', '9820011004', 'ramesh.patil@hospital.org'),
  ('Anil Kumar', 'labtech', 'Laboratory', 'Lab Technician', '9820011005', 'anil.kumar@hospital.org'),
  ('Deepa Shah', 'accountant', 'Billing', 'Accountant', '9820011006', 'deepa.shah@hospital.org'),
  ('Rajesh Gupta', 'hr', 'HR', 'HR Manager', '9820011007', 'rajesh.gupta@hospital.org'),
  ('Pooja Nair', 'employee', 'Housekeeping', 'Housekeeping Supervisor', '9820011008', 'pooja.nair@hospital.org');

-- Quality & Accreditation
create table if not exists patient_safety_incidents (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid references profiles(id),
  description text,
  stage text default 'Reported', -- Reported -> Under RCA -> Action Plan -> Closed
  rca_notes text,
  action_plan text,
  created_at timestamptz default now()
);
alter table patient_safety_incidents enable row level security;
create policy "quality/admin only — confidential per README" on patient_safety_incidents for all
  using ( public.current_user_role() in ('hr','admin','superadmin') )
  with check ( public.current_user_role() in ('hr','admin','superadmin') );

-- Ambulance
create table if not exists ambulance_trips (
  id uuid primary key default gen_random_uuid(),
  vehicle text, patient text, priority text,
  pickup text, destination text, reason text,
  stage text default 'Assigned', -- Assigned -> En Route -> On Scene -> Transporting -> At Hospital -> Completed
  mlc boolean default false,
  created_at timestamptz default now()
);
alter table ambulance_trips enable row level security;
create policy "reception/admin ambulance" on ambulance_trips for all
  using ( public.current_user_role() in ('reception','admin','superadmin') )
  with check ( public.current_user_role() in ('reception','admin','superadmin') );

-- Purchase & Procurement
create table if not exists purchase_requisitions (
  id uuid primary key default gen_random_uuid(),
  item text, quantity int, requested_by uuid references staff_directory(id),
  notes text,
  stage text default 'Pending Approval', -- -> Approved -> PO Raised -> Received
  created_at timestamptz default now()
);
alter table purchase_requisitions enable row level security;
create policy "inventory/admin purchase" on purchase_requisitions for all
  using ( public.current_user_role() in ('pharmacist','accountant','admin','superadmin') )
  with check ( public.current_user_role() in ('pharmacist','accountant','admin','superadmin') );

-- NOTE: Housekeeping, Security, Medical Records access-log, Nursing eMAR,
-- Specialty/Physio, and Command Center views are intentionally left out of
-- this first pass to keep the initial migration reviewable. Their field
-- lists are fully specified in the DC file's seed arrays (hkTasks,
-- visitorLog, mar, spReferrals, ptSessions, etc.) — copy the same
-- create-table + RLS pattern above when you build each one.

-- ============================================================================
-- SEED DATA (optional) — a handful of wards/beds so IPD isn't empty on first run
-- ============================================================================
insert into beds (ward, label, status) values
  ('ICU', 'IC-01', 'available'), ('ICU', 'IC-02', 'available'), ('ICU', 'IC-03', 'available'),
  ('General Ward A', 'GA-01', 'available'), ('General Ward A', 'GA-02', 'available'),
  ('General Ward A', 'GA-03', 'available'), ('General Ward A', 'GA-04', 'available'),
  ('Private Rooms', 'PR-01', 'available'), ('Private Rooms', 'PR-02', 'available'),
  ('Maternity', 'MT-01', 'available'), ('Maternity', 'MT-02', 'available')
on conflict (ward, label) do nothing;

-- ============================================================================
-- DOCTORS DIRECTORY
-- Replaces free-text "doctor" fields (Front Office registration, IPD
-- consultant assignment) with a real lookup table, so the frontend can offer
-- a department-filtered, availability-aware dropdown instead of a text box.
-- ============================================================================

create table if not exists doctors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,          -- e.g. 'Dr. Rakesh Mehta'
  department text not null,          -- matches the department dropdown used at registration
  designation text,                  -- e.g. 'Senior Consultant', 'Resident', 'HOD'
  qualification text,                -- e.g. 'MD, DM Cardiology'
  phone text,
  email text,
  status text not null default 'Available'
    check (status in ('Available','On Leave','In Surgery','Off Duty')),
  consult_days text[] default array['Mon','Tue','Wed','Thu','Fri'],
  active boolean not null default true,  -- soft-delete flag; false = no longer with the hospital
  created_at timestamptz default now(),
  unique (full_name, department)
);

alter table doctors enable row level security;

-- Every signed-in role needs to read this to populate the dropdown
-- (front office, IPD admission, doctors themselves, etc.)
create policy "authenticated can read doctors"
  on doctors for select
  using ( auth.role() = 'authenticated' );

-- Only admin/HR manage the roster (add/remove doctors, flip status/leave)
create policy "admin/hr can manage doctors"
  on doctors for all
  using ( public.current_user_role() in ('admin','superadmin','hr') )
  with check ( public.current_user_role() in ('admin','superadmin','hr') );

-- ----------------------------------------------------------------------------
-- SEED DATA — a starter roster across the departments used at registration,
-- with a mix of statuses so the "Available only" filter has something to
-- exclude too. Edit freely once you have a real doctor list.
-- ----------------------------------------------------------------------------
insert into doctors (full_name, department, designation, status) values
  ('Dr. Rakesh Mehta',      'General Medicine', 'Senior Consultant', 'Available'),
  ('Dr. Anjali Kulkarni',   'General Medicine', 'Consultant',        'Available'),
  ('Dr. Suresh Iyer',       'General Medicine', 'Resident',          'On Leave'),

  ('Dr. Vikram Nair',       'Cardiology',       'HOD',               'Available'),
  ('Dr. Priya Deshmukh',    'Cardiology',       'Consultant',        'Available'),

  ('Dr. Arjun Rathore',     'General Surgery',  'Senior Consultant', 'Available'),
  ('Dr. Neha Bhatt',        'General Surgery',  'Consultant',        'In Surgery'),

  ('Dr. Manish Chopra',     'Orthopedics',      'Senior Consultant', 'Available'),
  ('Dr. Kavita Joshi',      'Orthopedics',      'Consultant',        'Available'),

  ('Dr. Ritu Saxena',       'Gynecology',       'Senior Consultant', 'Available'),
  ('Dr. Meera Pillai',      'Gynecology',       'Consultant',        'Off Duty'),

  ('Dr. Sonal Kapoor',      'Obstetrics',       'Senior Consultant', 'Available'),

  ('Dr. Deepak Verma',      'Pediatrics',       'Senior Consultant', 'Available'),
  ('Dr. Anita Rao',         'Pediatrics',       'Consultant',        'Available'),

  ('Dr. Rohan Kulkarni',    'ENT',              'Consultant',        'Available'),

  ('Dr. Sneha Agarwal',     'Dermatology',      'Consultant',        'Available'),

  ('Dr. Ashok Bhatia',      'Endocrinology',    'Senior Consultant', 'Available'),

  ('Dr. Farhan Sheikh',     'Critical Care',    'Senior Consultant', 'Available'),
  ('Dr. Lakshmi Menon',     'Critical Care',    'Consultant',        'Available')
on conflict (full_name, department) do nothing;
