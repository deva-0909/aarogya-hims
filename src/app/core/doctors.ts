export interface Doctor {
  id: string;
  full_name: string;
  department: string;
  designation: string | null;
  status: 'Available' | 'On Leave' | 'In Surgery' | 'Off Duty';
  active: boolean;
}

export const DOCTOR_STATUS_DOT: Record<string, string> = {
  Available: 'bg-[#1d9a57]',
  'On Leave': 'bg-[#c9a227]',
  'In Surgery': 'bg-[#c2410c]',
  'Off Duty': 'bg-[#94a3b8]',
};

/** Doctors bookable for a *new* assignment — on the roster, actually Available right now, optionally narrowed to one department. */
export function bookableDoctors(all: Doctor[], department?: string): Doctor[] {
  return all
    .filter((d) => d.active && d.status === 'Available' && (!department || d.department === department))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/** Full active roster for a department, regardless of current status — used where you want to see who's on leave too, not just who's bookable. */
export function rosterFor(all: Doctor[], department?: string): Doctor[] {
  return all
    .filter((d) => d.active && (!department || d.department === department))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}
