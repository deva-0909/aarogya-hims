export interface HimsModule {
  id: number;
  short: string;
  name: string;
  group: string;
  icon: string;
  desc: string;
  status: 'live' | 'stub';
  route?: string;
}

// Copied verbatim (ids, names, groups, icons, descriptions) from the
// prototype's MODS array, so this matches the reference source exactly --
// including the description text used in the shared page header.
export const MODULES: HimsModule[] = [
  { id: 1, short: 'Command Center', name: 'Administration & Management', group: 'Administration', icon: 'ph-squares-four', desc: 'Overall hospital administration, strategic planning, and management of resources.', status: 'live', route: 'command-center' },
  { id: 2, short: 'Front Office', name: 'Front Office & Reception', group: 'Patient Services', icon: 'ph-door-open', desc: 'Patient registration, appointment scheduling, and initial billing tasks.', status: 'live', route: 'front-office' },
  { id: 3, short: 'OPD', name: 'Outpatient Department (OPD)', group: 'Clinical Care', icon: 'ph-stethoscope', desc: 'Consultations, outpatient records, and follow-up visit management.', status: 'live', route: 'opd' },
  { id: 4, short: 'IPD — Wards', name: 'Inpatient Department (IPD)', group: 'Clinical Care', icon: 'ph-bed', desc: 'Admission, bed allocation, ward management, and discharge planning.', status: 'live', route: 'ipd' },
  { id: 5, short: 'Emergency', name: 'Emergency & Trauma', group: 'Clinical Care', icon: 'ph-first-aid-kit', desc: 'Immediate patient triage, emergency procedures, and critical case management.', status: 'live', route: 'emergency' },
  { id: 6, short: 'Pharmacy', name: 'Pharmacy', group: 'Diagnostics & Pharmacy', icon: 'ph-pill', desc: 'Medication dispensing, inventory control, prescription management, and drug interactions.', status: 'live', route: 'pharmacy' },
  { id: 7, short: 'Laboratory', name: 'Laboratory (Pathology & Diagnostics)', group: 'Diagnostics & Pharmacy', icon: 'ph-flask', desc: 'Sample collection, test processing, results entry, and lab inventory management.', status: 'live', route: 'laboratory' },
  { id: 8, short: 'Radiology', name: 'Radiology & Imaging', group: 'Diagnostics & Pharmacy', icon: 'ph-scan', desc: 'X-rays, CT/MRI scans, ultrasound, and image archiving (PACS integration).', status: 'live', route: 'radiology' },
  { id: 9, short: 'Surgery / OT', name: 'Operating Theatre / Surgery', group: 'Clinical Care', icon: 'ph-scissors', desc: 'Surgical scheduling, OT staff coordination, and procedure documentation.', status: 'live', route: 'surgery' },
  { id: 10, short: 'ICU', name: 'ICU / Critical Care', group: 'Clinical Care', icon: 'ph-heartbeat', desc: 'Intensive monitoring, specialized equipment management, and critical patient data tracking.', status: 'live', route: 'icu' },
  { id: 11, short: 'Nursing', name: 'Nursing', group: 'Clinical Care', icon: 'ph-hand-heart', desc: 'Patient care, medication administration, vital signs tracking, and shift handovers.', status: 'live', route: 'nursing' },
  { id: 12, short: 'Medical Records', name: 'Medical Records / Health Information', group: 'Operations', icon: 'ph-folders', desc: 'Patient record maintenance, coding, indexing, and secure storage of health data.', status: 'live', route: 'medical-records' },
  { id: 13, short: 'Billing & Finance', name: 'Billing & Finance', group: 'Revenue Cycle', icon: 'ph-receipt', desc: 'Invoicing, payment collection, insurance claims, and financial reporting.', status: 'live', route: 'billing' },
  { id: 14, short: 'Insurance / TPA', name: 'Insurance & TPA Coordination', group: 'Revenue Cycle', icon: 'ph-shield-check', desc: 'Policy verification, claim processing, and communication with third-party administrators.', status: 'live', route: 'insurance' },
  { id: 15, short: 'Housekeeping', name: 'Housekeeping & Maintenance', group: 'Operations', icon: 'ph-broom', desc: 'Cleaning schedules, facility upkeep, and maintenance requests.', status: 'live', route: 'housekeeping' },
  { id: 16, short: 'Inventory', name: 'Inventory & Supply Chain', group: 'Operations', icon: 'ph-package', desc: 'Stock management, procurement, and vendor coordination for supplies and equipment.', status: 'live', route: 'inventory' },
  { id: 17, short: 'Human Resources', name: 'Human Resources (HR)', group: 'Administration', icon: 'ph-users-three', desc: 'Staff recruitment, payroll, leave management, and performance reviews.', status: 'live', route: 'hr' },
  { id: 18, short: 'IT & Support', name: 'IT & Support', group: 'Administration', icon: 'ph-desktop-tower', desc: 'HIMS administration, technical support, and system security.', status: 'live', route: 'it-support' },
  { id: 19, short: 'Security', name: 'Security & Access Control', group: 'Operations', icon: 'ph-lock-key', desc: 'Visitor management, CCTV monitoring, and emergency response protocols.', status: 'live', route: 'security' },
  { id: 20, short: 'Blood Bank', name: 'Blood Bank & Transfusion Services', group: 'Diagnostics & Pharmacy', icon: 'ph-drop', desc: 'Donor screening, blood storage, transfusion records, and inventory.', status: 'live', route: 'blood-bank' },
  { id: 21, short: 'Quality & Accred.', name: 'Quality Assurance & Accreditation', group: 'Administration', icon: 'ph-seal-check', desc: 'Compliance tracking, audits, and adherence to standards (e.g., NABH, JCI).', status: 'live', route: 'quality' },
  { id: 22, short: 'Ambulance', name: 'Ambulance & Patient Transport', group: 'Patient Services', icon: 'ph-ambulance', desc: 'Dispatch management, tracking, and coordination of patient transport services.', status: 'live', route: 'ambulance' },
  { id: 23, short: 'Specialty Depts', name: 'Specialty Departments', group: 'Clinical Care', icon: 'ph-brain', desc: 'Department-specific workflows, clinical documentation, and specialized procedures.', status: 'live', route: 'specialty' },
  { id: 24, short: 'Physiotherapy', name: 'Physiotherapy & Rehabilitation', group: 'Clinical Care', icon: 'ph-person-simple-walk', desc: 'Patient rehabilitation programs, exercise scheduling, and progress tracking.', status: 'live', route: 'physiotherapy' },
  { id: 25, short: 'PR & Marketing', name: 'Public Relations & Marketing', group: 'Patient Services', icon: 'ph-megaphone', desc: 'Media, community outreach, event management, and patient feedback.', status: 'live', route: 'pr-marketing' },
  { id: 26, short: 'My Workspace', name: 'Employee Self-Service', group: 'Administration', icon: 'ph-user-circle', desc: 'Personal attendance, payslips, leave, schedule, and reimbursement claims.', status: 'live', route: 'my-workspace' },
  { id: 27, short: 'Purchase', name: 'Purchase & Procurement', group: 'Operations', icon: 'ph-shopping-cart-simple', desc: 'Department requisitions, approvals, purchase orders, and goods receipt.', status: 'live', route: 'purchase' },
];

interface RoleConfig {
  label: string;
  title: string;
  mods: number[] | null; // null = all modules (superadmin / admin)
  defaultRoute: string; // where this role lands instead of a one-size-fits-all Command Center
}

export const ROLES: Record<string, RoleConfig> = {
  superadmin: { label: 'Super Admin', title: 'Super Administrator', mods: null, defaultRoute: 'command-center' },
  admin: { label: 'Administrator', title: 'Chief Medical Officer', mods: null, defaultRoute: 'command-center' },
  doctor: { label: 'Doctor', title: 'Consultant', mods: [1, 3, 4, 5, 9, 10, 23, 7, 8, 6, 12], defaultRoute: 'opd' },
  nurse: { label: 'Nurse', title: 'Staff Nurse', mods: [4, 10, 11, 5, 3], defaultRoute: 'nursing' },
  reception: { label: 'Receptionist', title: 'Front Desk Executive', mods: [2, 3, 13, 14, 22], defaultRoute: 'front-office' },
  pharmacist: { label: 'Pharmacist', title: 'Chief Pharmacist', mods: [6, 16], defaultRoute: 'pharmacy' },
  pathologist: { label: 'Pathologist', title: 'Lab — Pathology', mods: [7, 20], defaultRoute: 'laboratory' },
  radiologist: { label: 'Radiologist', title: 'Radiology & Imaging', mods: [8, 3, 12, 23], defaultRoute: 'radiology' },
  accountant: { label: 'Accountant', title: 'Finance & Billing', mods: [13, 14, 17, 16], defaultRoute: 'billing' },
  hr: { label: 'HR Manager', title: 'Head — Human Resources', mods: [17, 1, 12, 21, 26], defaultRoute: 'hr' },
  hod: { label: 'HOD — Cardiology', title: 'Head of Department', mods: [17, 4, 6, 3, 26], defaultRoute: 'ipd' },
  labtech: { label: 'Lab Technician', title: 'Laboratory Technician', mods: [7, 20, 16, 26], defaultRoute: 'laboratory' },
  employee: { label: 'Employee (Self-Service)', title: 'Staff — General Ward', mods: [26], defaultRoute: 'my-workspace' },
};

const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m]));

export function modulesForRole(role: string | null): HimsModule[] {
  if (!role) return [];
  const cfg = ROLES[role];
  if (!cfg) return [];
  if (cfg.mods === null) return MODULES;
  return cfg.mods.map((id) => MODULE_BY_ID[id]).filter(Boolean);
}

export function groupedModulesForRole(role: string | null): [string, HimsModule[]][] {
  const mods = modulesForRole(role);
  const byGroup: Record<string, HimsModule[]> = {};
  for (const m of mods) {
    (byGroup[m.group] ??= []).push(m);
  }
  return Object.entries(byGroup);
}

export function roleLabel(role: string | null): string {
  return (role && ROLES[role]?.label) ?? role ?? '—';
}

export function roleTitle(role: string | null): string {
  return (role && ROLES[role]?.title) ?? '';
}

export function defaultRouteForRole(role: string | null): string {
  return (role && ROLES[role]?.defaultRoute) ?? 'command-center';
}

export function routeFor(mod: HimsModule): string {
  return mod.route ?? `module-${mod.id}`;
}

export function moduleByRoute(path: string): HimsModule | undefined {
  return MODULES.find((m) => routeFor(m) === path);
}
