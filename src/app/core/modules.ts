export interface HimsModule {
  id: number;
  short: string;
  name: string;
  group: string;
  icon: string;
  status: 'live' | 'stub';
  route?: string;
}

export const MODULES: HimsModule[] = [
  { id: 1, short: 'Command Center', name: 'Administration & Management', group: 'Administration', icon: 'ph-squares-four', status: 'live', route: 'command-center' },
  { id: 2, short: 'Front Office', name: 'Front Office & Reception', group: 'Patient Services', icon: 'ph-door-open', status: 'live', route: 'front-office' },
  { id: 3, short: 'OPD', name: 'Outpatient Department (OPD)', group: 'Clinical Care', icon: 'ph-stethoscope', status: 'live', route: 'opd' },
  { id: 4, short: 'IPD — Wards', name: 'Inpatient Department (IPD)', group: 'Clinical Care', icon: 'ph-bed', status: 'live', route: 'ipd' },
  { id: 5, short: 'Emergency', name: 'Emergency & Trauma', group: 'Clinical Care', icon: 'ph-first-aid-kit', status: 'live', route: 'emergency' },
  { id: 6, short: 'Pharmacy', name: 'Pharmacy', group: 'Diagnostics & Pharmacy', icon: 'ph-pill', status: 'live', route: 'pharmacy' },
  { id: 7, short: 'Laboratory', name: 'Laboratory (Pathology & Diagnostics)', group: 'Diagnostics & Pharmacy', icon: 'ph-flask', status: 'live', route: 'laboratory' },
  { id: 8, short: 'Radiology', name: 'Radiology & Imaging', group: 'Diagnostics & Pharmacy', icon: 'ph-scan', status: 'live', route: 'radiology' },
  { id: 9, short: 'Surgery / OT', name: 'Operating Theatre / Surgery', group: 'Clinical Care', icon: 'ph-scissors', status: 'live', route: 'surgery' },
  { id: 10, short: 'ICU', name: 'ICU / Critical Care', group: 'Clinical Care', icon: 'ph-heartbeat', status: 'live', route: 'icu' },
  { id: 11, short: 'Nursing', name: 'Nursing', group: 'Clinical Care', icon: 'ph-hand-heart', status: 'live', route: 'nursing' },
  { id: 12, short: 'Medical Records', name: 'Medical Records / Health Information', group: 'Operations', icon: 'ph-folders', status: 'live', route: 'medical-records' },
  { id: 13, short: 'Billing & Finance', name: 'Billing & Finance', group: 'Revenue Cycle', icon: 'ph-receipt', status: 'live', route: 'billing' },
  { id: 14, short: 'Insurance / TPA', name: 'Insurance & TPA Coordination', group: 'Revenue Cycle', icon: 'ph-shield-check', status: 'live', route: 'insurance' },
  { id: 15, short: 'Housekeeping', name: 'Housekeeping & Maintenance', group: 'Operations', icon: 'ph-broom', status: 'live', route: 'housekeeping' },
  { id: 16, short: 'Inventory', name: 'Inventory & Supply Chain', group: 'Operations', icon: 'ph-package', status: 'live', route: 'inventory' },
  { id: 17, short: 'Human Resources', name: 'Human Resources (HR)', group: 'Administration', icon: 'ph-users-three', status: 'live', route: 'hr' },
  { id: 18, short: 'IT & Support', name: 'IT & Support', group: 'Administration', icon: 'ph-desktop-tower', status: 'live', route: 'it-support' },
  { id: 19, short: 'Security', name: 'Security & Access Control', group: 'Operations', icon: 'ph-lock-key', status: 'live', route: 'security' },
  { id: 20, short: 'Blood Bank', name: 'Blood Bank & Transfusion Services', group: 'Diagnostics & Pharmacy', icon: 'ph-drop', status: 'live', route: 'blood-bank' },
  { id: 21, short: 'Quality & Accred.', name: 'Quality Assurance & Accreditation', group: 'Administration', icon: 'ph-seal-check', status: 'live', route: 'quality' },
  { id: 22, short: 'Ambulance', name: 'Ambulance & Patient Transport', group: 'Patient Services', icon: 'ph-ambulance', status: 'live', route: 'ambulance' },
  { id: 23, short: 'Specialty Depts', name: 'Specialty Departments', group: 'Clinical Care', icon: 'ph-brain', status: 'live', route: 'specialty' },
  { id: 24, short: 'Physiotherapy', name: 'Physiotherapy & Rehabilitation', group: 'Clinical Care', icon: 'ph-person-simple-walk', status: 'live', route: 'physiotherapy' },
  { id: 25, short: 'PR & Marketing', name: 'Public Relations & Marketing', group: 'Patient Services', icon: 'ph-megaphone', status: 'live', route: 'pr-marketing' },
  { id: 26, short: 'My Workspace', name: 'Employee Self-Service', group: 'Administration', icon: 'ph-user-circle', status: 'live', route: 'my-workspace' },
  { id: 27, short: 'Purchase', name: 'Purchase & Procurement', group: 'Operations', icon: 'ph-shopping-cart-simple', status: 'live', route: 'purchase' },
];

interface RoleConfig {
  label: string;
  mods: number[] | null; // null = all modules (superadmin / admin)
}

export const ROLES: Record<string, RoleConfig> = {
  superadmin: { label: 'Super Admin', mods: null },
  admin: { label: 'Administrator', mods: null },
  doctor: { label: 'Doctor', mods: [1, 3, 4, 5, 9, 10, 23, 7, 8, 6, 12] },
  nurse: { label: 'Nurse', mods: [4, 10, 11, 5, 3] },
  reception: { label: 'Receptionist', mods: [2, 3, 13, 14, 22] },
  pharmacist: { label: 'Pharmacist', mods: [6, 16] },
  pathologist: { label: 'Pathologist', mods: [7, 20] },
  radiologist: { label: 'Radiologist', mods: [8, 3, 12, 23] },
  accountant: { label: 'Accountant', mods: [13, 14, 17, 16] },
  hr: { label: 'HR Manager', mods: [17, 1, 12, 21, 26] },
  hod: { label: 'HOD — Cardiology', mods: [17, 4, 6, 3, 26] },
  labtech: { label: 'Lab Technician', mods: [7, 20, 16, 26] },
  employee: { label: 'Employee (Self-Service)', mods: [26] },
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

export function routeFor(mod: HimsModule): string {
  return mod.route ?? `module-${mod.id}`;
}
