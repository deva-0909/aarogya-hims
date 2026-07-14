import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';
import { PrintLetterheadComponent } from '../../shared/print-letterhead.component';
import { AttendanceCaptureComponent, AttendanceCapture } from '../../shared/attendance-capture.component';

type HrTab = 'directory' | 'attendance' | 'onboarding' | 'exit' | 'salary' | 'payroll' | 'letters' | 'orgchart' | 'loans' | 'grievance';

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Maternity/Paternity', 'Unpaid'];

// Real statutory entitlements per year -- figures shown are Maharashtra
// Shops & Establishments Act (Regulation of Employment and Conditions of
// Service) 2017, since that's this hospital's operating state; other
// states set different numbers under their own Shops Act (e.g. Delhi:
// 12/12/15, Karnataka: 12 sick + 18 earned, no separate casual). Maternity
// is the one leave type set centrally and uniformly nationwide, not by
// state: 26 weeks (182 days) for the first two children, 12 weeks for
// subsequent ones, under the Maternity Benefit Act 1961. Paternity leave
// has no statutory mandate in the private sector -- entirely a company
// policy matter, noted rather than assumed.
const LEAVE_ENTITLEMENTS: Record<string, number | null> = {
  Casual: 8,
  Sick: 15,
  Earned: 21,
  'Maternity/Paternity': 182, // uses the higher (maternity) figure as the reference ceiling; see paternity note in the UI
  Unpaid: null, // no statutory cap
};
const EMPLOYMENT_TYPES = ['Permanent', 'Medical Officer', 'Contract', 'Consultant', 'Intern'];
const LOAN_TYPES = ['Personal Loan', 'Salary Advance', 'Medical Advance', 'Festival Advance'];
const LETTER_TYPES = ['Offer Letter', 'Appointment Letter', 'Relieving Letter', 'Experience Letter', 'Salary Certificate'];
const GRIEVANCE_CATEGORIES = ['Workplace Conduct', 'Compensation', 'Facilities', 'Harassment', 'Discrimination', 'Other'];

// Real Indian HR onboarding/offboarding document requirements -- not
// generic placeholders. Aadhaar and PAN are mandatory KYC for payroll and
// statutory filings (PF/ESI/TDS); relieving letter from a previous
// employer is standard practice before confirming a new hire.
const DEFAULT_ONBOARDING_DOCS = [
  'Aadhaar Card', 'PAN Card', 'Bank Account Details', 'Educational Certificates',
  'Previous Employer Relieving Letter', 'Passport-size Photographs', 'Address Proof',
];

// NABH's HRM chapter requires a verified credential file for every
// clinical staff member -- Medical Council registration checked directly
// with the council (not just a visual document check), plus a two-step
// Credentialing (verifying qualifications) then Privileging (defining what
// procedures they're actually permitted to perform independently) process
// before granting clinical duties. Pre-employment health screening is a
// separate NABH staff-health requirement, distinct from patient care.
const CLINICAL_CREDENTIALING_DOCS = [
  'Medical Council Registration (verified with State Medical Council)',
  'Credentialing Committee Review -- Qualifications Verified',
  'Privileging -- Scope of Clinical Practice Defined & Approved',
  'Pre-Employment Health Screening & Immunization Record',
];

function onboardingDocsFor(employmentType: string): string[] {
  const isClinical = employmentType === 'Medical Officer' || employmentType === 'Consultant';
  return isClinical ? [...DEFAULT_ONBOARDING_DOCS, ...CLINICAL_CREDENTIALING_DOCS] : DEFAULT_ONBOARDING_DOCS;
}

const DEFAULT_EXIT_CLEARANCE = [
  'IT / System Access Revoked', 'Finance Clearance (Advances/Loans)', 'Admin — Asset Return (ID Card, Equipment)',
  'Department Head Sign-off', 'Library / Stores Clearance',
];

const STAGE_COLOR: Record<string, { bg: string; fg: string }> = {
  Requested: { bg: '#e4edfb', fg: '#2257a3' },
  Approved: { bg: '#ece8fb', fg: '#5536c9' },
  Disbursed: { bg: '#fdf0d8', fg: '#946200' },
  Recovering: { bg: '#fdf0d8', fg: '#946200' },
  Closed: { bg: '#dff1ef', fg: '#0b7d72' },
  Reported: { bg: '#fdf0d8', fg: '#946200' },
  'Under Review': { bg: '#e4edfb', fg: '#2257a3' },
  Resolved: { bg: '#dff1ef', fg: '#0b7d72' },
  Escalated: { bg: '#fbe3e3', fg: '#b42318' },
  Clearance: { bg: '#fdf0d8', fg: '#946200' },
  Settlement: { bg: '#e4edfb', fg: '#2257a3' },
  'Exit Interview': { bg: '#ece8fb', fg: '#5536c9' },
  Completed: { bg: '#dff1ef', fg: '#0b7d72' },
  Documents: { bg: '#fdf0d8', fg: '#946200' },
  'IT & Access': { bg: '#e4edfb', fg: '#2257a3' },
  Induction: { bg: '#ece8fb', fg: '#5536c9' },
};

// Real PF/ESI monthly contribution formulas (rates stable for years,
// current through 2026):
//   PF: employee 12% of (Basic+DA), employer 12% split into EPS 8.33%
//       (capped at the Rs 15,000 wage ceiling -> max Rs 1,250/month) +
//       EPF 3.67% (the balance) + employer EDLI 0.5% (same Rs 15,000 cap)
//       + admin charge 0.5% (min Rs 500/month).
//   ESI: employee 0.75%, employer 3.25% of GROSS wages -- only when gross
//       is <= Rs 21,000/month (Rs 25,000 for persons with disabilities).
// Basic is derived from the Salary Structure row's basic_pct of the
// employee's monthly CTC, not a separately tracked figure.
const PF_WAGE_CEILING = 15000;
const ESI_WAGE_CEILING = 21000;

interface StatutoryBreakdown {
  basic: number;
  employeePF: number;
  employerEPS: number;
  employerEPF: number;
  employerEDLI: number;
  adminCharge: number;
  esiApplicable: boolean;
  employeeESI: number;
  employerESI: number;
  professionalTax: number;
}

// Maharashtra Professional Tax slabs, FY 2025-26/2026-27 (this hospital's
// operating state) -- calculated on GROSS monthly salary, not CTC, Basic,
// or Net (a common real-world error). Capped at Rs 2,500/year via the
// February +Rs 100 adjustment (Rs 200 x 11 months + Rs 300 in February).
// Maharashtra specifically exempts women earning up to Rs 25,000/month --
// a real, material, commonly-missed exemption, not a rounding footnote.
function computeMaharashtraPT(grossMonthly: number, gender: string | null, isFebruary: boolean): number {
  if (gender === 'Female' && grossMonthly <= 25000) return 0;
  if (grossMonthly <= 7500) return 0;
  if (grossMonthly <= 10000) return 175;
  return isFebruary ? 300 : 200;
}

// New Tax Regime (Section 115BAC, the DEFAULT regime unless an employee
// explicitly declares the old regime to their employer) slabs for FY
// 2025-26 -- stable and unchanged for FY 2026-27 per Budget 2026. This is
// an ESTIMATE ONLY: real payroll TDS also depends on individual
// declarations (Form 12BB) which this system doesn't collect -- an
// employee who opts for the old regime with HRA/80C/80D claims would see
// a materially different number. Verified against a real cited reference
// case before trusting this: Rs 15,00,000 annual salary should produce
// exactly Rs 97,500 annual tax (Rs 8,125/month) after standard deduction
// and cess -- confirmed by hand-computing the slabs below.
const NEW_REGIME_STANDARD_DEDUCTION = 75000;
const NEW_REGIME_SLABS = [
  { upTo: 400000, rate: 0 },
  { upTo: 800000, rate: 0.05 },
  { upTo: 1200000, rate: 0.10 },
  { upTo: 1600000, rate: 0.15 },
  { upTo: 2000000, rate: 0.20 },
  { upTo: 2400000, rate: 0.25 },
  { upTo: Infinity, rate: 0.30 },
];

function estimateMonthlyTDS(annualCTC: number): number {
  const taxableIncome = Math.max(0, annualCTC - NEW_REGIME_STANDARD_DEDUCTION);

  // Section 87A rebate: taxable income up to Rs 12,00,000 is fully
  // rebated (up to Rs 60,000) under the new regime -- effectively zero
  // tax. Marginal relief for income slightly above this threshold is a
  // narrow edge case NOT implemented here -- flagged rather than guessed.
  if (taxableIncome <= 1200000) return 0;

  let tax = 0;
  let lastCap = 0;
  for (const slab of NEW_REGIME_SLABS) {
    if (taxableIncome > lastCap) {
      const amountInSlab = Math.min(taxableIncome, slab.upTo) - lastCap;
      tax += amountInSlab * slab.rate;
      lastCap = slab.upTo;
    }
  }
  const withCess = tax * 1.04; // 4% Health & Education Cess
  return Math.round(withCess / 12);
}

function computeStatutoryDeductions(ctc: number, structure: any, gender: string | null = null): StatutoryBreakdown {
  const basic = ctc * (Number(structure?.basic_pct ?? 0) / 100);
  const pfApplicable = !!structure?.pf_applicable;
  const pfWageBase = Math.min(basic, PF_WAGE_CEILING);

  const employeePF = pfApplicable ? Math.round(basic * 0.12) : 0;
  const employerEPS = pfApplicable ? Math.round(pfWageBase * 0.0833) : 0;
  const employerEPF = pfApplicable ? Math.round(basic * 0.12) - employerEPS : 0;
  const employerEDLI = pfApplicable ? Math.round(pfWageBase * 0.005) : 0;
  const adminCharge = pfApplicable ? 500 : 0; // per-establishment minimum, not per-employee in reality, but shown per employee for illustration

  const esiApplicable = !!structure?.esi_applicable && ctc <= ESI_WAGE_CEILING;
  const employeeESI = esiApplicable ? Math.round(ctc * 0.0075) : 0;
  const employerESI = esiApplicable ? Math.round(ctc * 0.0325) : 0;

  const isFebruary = new Date().getMonth() === 1; // 0-indexed: January=0, February=1
  const professionalTax = structure?.pt_applicable ? computeMaharashtraPT(ctc, gender, isFebruary) : 0;

  return { basic, employeePF, employerEPS, employerEPF, employerEDLI, adminCharge, esiApplicable, employeeESI, employerESI, professionalTax };
}

function shortId(id: string, prefix: string): string {
  return prefix + '-' + id.slice(0, 4).toUpperCase();
}

function pillStyle(stage: string) {
  return STAGE_COLOR[stage] ?? { bg: '#eaeef3', fg: '#51687d' };
}

@Component({
  selector: 'app-hr',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent, PrintLetterheadComponent, AttendanceCaptureComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>

      <!-- Tab bar -->
      <div class="flex items-center gap-1.5 mb-[14px] overflow-x-auto pb-1">
        <button *ngFor="let t of tabs" (click)="activeTab = t.key"
          class="flex-none flex items-center gap-[6px] rounded-[9px] px-[13px] py-[8px] text-[12px] font-semibold whitespace-nowrap"
          [style.background]="activeTab === t.key ? '#0d8c80' : '#fff'"
          [style.color]="activeTab === t.key ? '#fff' : '#52677b'"
          [style.border]="'1px solid ' + (activeTab === t.key ? '#0d8c80' : '#dde5ee')">
          <i class="ph {{ t.icon }} text-[14px]"></i>{{ t.label }}
        </button>
      </div>

      <!-- ================= DIRECTORY ================= -->
      <div *ngIf="activeTab === 'directory'">
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-6">
          <div class="xl:col-span-2 bg-white border border-line-1 rounded-card overflow-hidden">
            <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm flex items-center justify-between gap-2 flex-wrap">
              <span>Staff Directory ({{ filteredStaff().length }}{{ staffSearch ? ' of ' + staff.data().length : '' }})</span>
              <button (click)="showNewStaff = true" class="bg-brand hover:bg-brand-hover text-white rounded-[7px] px-3 py-1.5 text-[11.5px] font-semibold">+ New Staff</button>
            </div>
            <div class="px-5 py-2.5 border-b border-line-1">
              <input [(ngModel)]="staffSearch" name="staffSearch" placeholder="Search by name, title, department, or employee ID…"
                class="w-full border border-line-1 rounded-[9px] px-3 py-1.5 text-[12.5px] outline-none focus:border-brand" />
            </div>
            <div class="overflow-x-auto"><table class="w-full text-sm">
              <thead>
                <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                  <th class="px-4 py-2 font-medium">ID</th>
                  <th class="px-4 py-2 font-medium">Name</th>
                  <th class="px-4 py-2 font-medium">Role / Dept</th>
                  <th class="px-4 py-2 font-medium">Type</th>
                  <th class="px-4 py-2 font-medium">Joined</th>
                  <th class="px-4 py-2 font-medium">Status</th>
                  <th class="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                <tr *ngIf="filteredStaff().length === 0">
                  <td colspan="7" class="px-4 py-6 text-center text-body-2">No staff match "{{ staffSearch }}".</td>
                </tr>
                <tr *ngFor="let s of filteredStaff()" class="border-b border-line-2 last:border-0">
                  <td class="px-4 py-2 font-mono text-[11.5px] text-brand">{{ s.employee_id || '—' }}</td>
                  <td class="px-4 py-2">
                    <div class="font-medium text-ink-2">{{ s.full_name }}</div>
                    <div class="text-[11.5px] text-muted-1">{{ s.title }}</div>
                  </td>
                  <td class="px-4 py-2">
                    <div class="text-body-1 capitalize">{{ s.role }}</div>
                    <div class="text-[11.5px] text-muted-1">{{ s.department }}</div>
                  </td>
                  <td class="px-4 py-2 text-[12px] text-body-1">{{ s.employment_type || 'Permanent' }}</td>
                  <td class="px-4 py-2 font-mono text-[11.5px] text-body-1">{{ s.date_of_joining || '—' }}</td>
                  <td class="px-4 py-2">
                    <span class="px-2 py-0.5 rounded-pill text-[11px] font-semibold"
                      [class]="s.status === 'Inactive' ? 'bg-line-2 text-body-2' : 'bg-success-bg text-success-fg'">
                      {{ s.status || 'Active' }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-right">
                    <button (click)="openProfile(s)" class="text-[12px] font-semibold text-brand hover:underline whitespace-nowrap">View Profile</button>
                  </td>
                </tr>
              </tbody>
            </table></div>
          </div>

          <form (ngSubmit)="createLeave()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 h-fit">
            <h2 class="font-semibold text-ink-2 text-sm mb-1">Request Leave</h2>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Staff member</label>
              <select required [(ngModel)]="leaveForm.staff_id" name="staff_id"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option value="" disabled>Select staff</option>
                <option *ngFor="let s of staff.data()" [value]="s.id">{{ s.full_name }} — {{ s.title }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Leave type</label>
              <select [(ngModel)]="leaveForm.leave_type" name="leave_type"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option *ngFor="let t of leaveTypes" [value]="t">{{ t }}</option>
              </select>
            </div>
            <div *ngIf="leaveForm.staff_id" class="text-[11px] rounded-[8px] px-[10px] py-[7px]"
              [class]="leaveBalance().overLimit ? 'bg-warning-bg text-warning-fg' : 'bg-[#f7f9fb] text-[#5f7689]'">
              {{ leaveBalance().text }}
            </div>
            <div *ngIf="leaveForm.leave_type === 'Maternity/Paternity'" class="text-[10.5px] text-muted-1">
              Maternity: 26 weeks (1st/2nd child), 12 weeks (3rd+) -- Maternity Benefit Act 1961, uniform nationwide.
              Paternity: no statutory entitlement in the private sector -- company policy only.
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-body-1 mb-1">From</label>
                <input required type="date" [(ngModel)]="leaveForm.start_date" name="start_date"
                  class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
              </div>
              <div>
                <label class="block text-xs font-medium text-body-1 mb-1">To</label>
                <input required type="date" [(ngModel)]="leaveForm.end_date" name="end_date"
                  class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
              </div>
            </div>
            <button type="submit" [disabled]="submitting || staff.data().length === 0"
              class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
              {{ submitting ? 'Submitting…' : 'Submit request' }}
            </button>
          </form>
        </div>

        <div class="bg-white border border-line-1 rounded-card overflow-hidden">
          <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm">Leave Requests</div>
          <div class="overflow-x-auto"><table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                <th class="px-4 py-2 font-medium">Staff</th>
                <th class="px-4 py-2 font-medium">Type</th>
                <th class="px-4 py-2 font-medium">Dates</th>
                <th class="px-4 py-2 font-medium">Status</th>
                <th class="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngIf="!leaves.loading() && leaves.data().length === 0">
                <td colspan="5" class="px-4 py-6 text-center text-body-2">No leave requests yet.</td>
              </tr>
              <tr *ngFor="let l of leaves.data()" class="border-b border-line-2 last:border-0">
                <td class="px-4 py-2 font-medium text-ink-2">{{ staffName(l.staff_id) }}</td>
                <td class="px-4 py-2 text-body-1">{{ l.leave_type }}</td>
                <td class="px-4 py-2 text-body-1">{{ l.start_date }} → {{ l.end_date }}</td>
                <td class="px-4 py-2">
                  <span class="px-2 py-0.5 rounded-pill text-[11.5px] font-medium"
                    [class]="l.status === 'Approved' ? 'bg-success-bg text-success-fg' : l.status === 'Rejected' ? 'bg-danger-bg text-danger-fg' : 'bg-warning-bg text-warning-fg'">
                    {{ l.status }}
                  </span>
                </td>
                <td class="px-4 py-2 text-right" *ngIf="l.status === 'Pending'">
                  <button (click)="setLeaveStatus(l, 'Approved')" class="text-[12px] font-semibold text-success-fg hover:underline mr-3">Approve</button>
                  <button (click)="setLeaveStatus(l, 'Rejected')" class="text-[12px] font-semibold text-danger-fg hover:underline">Reject</button>
                </td>
              </tr>
            </tbody>
          </table></div>
        </div>
      </div>

      <!-- ================= ATTENDANCE ================= -->
      <div *ngIf="activeTab === 'attendance'" class="flex flex-col gap-[14px]">
        <app-kpi-row [items]="attendanceKpis()"></app-kpi-row>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-[14px]">
          <!-- Self check-in/out widget -->
          <div class="bg-white border border-line-1 rounded-card p-5 h-fit">
            <h2 class="font-semibold text-ink-2 text-sm mb-1">Mark Attendance</h2>
            <p class="text-[11.5px] text-muted-1 mb-3">Photo + location captured at check-in and check-out, matching real hospital HRMS practice -- no biometric hardware needed, just this device's camera.</p>

            <label class="block text-xs font-medium text-body-1 mb-1">I am:</label>
            <select [(ngModel)]="attendanceStaffId" name="attendanceStaffId"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand mb-3">
              <option value="">Select yourself</option>
              <option *ngFor="let s of staff.data()" [value]="s.id">{{ s.full_name }} — {{ s.title }}</option>
            </select>

            <div *ngIf="attendanceStaffId">
              <div *ngIf="todaysAttendanceFor(attendanceStaffId) as today; else notCheckedIn">
                <div class="text-[12.5px] text-body-1 mb-2">
                  Checked in at <b class="font-mono">{{ today.check_in_at | date: 'shortTime' }}</b>
                  <span *ngIf="today.check_in_lat"> · <i class="ph ph-map-pin"></i> location captured</span>
                </div>
                <button *ngIf="!today.check_out_at" (click)="startCapture('out')"
                  class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold">
                  Check Out
                </button>
                <div *ngIf="today.check_out_at" class="text-[12.5px] text-success-fg bg-success-bg rounded-[9px] px-3 py-2 text-center">
                  Checked out at {{ today.check_out_at | date: 'shortTime' }} -- {{ hoursWorked(today) }} hrs today
                </div>
              </div>
              <ng-template #notCheckedIn>
                <button (click)="startCapture('in')"
                  class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold">
                  Check In
                </button>
              </ng-template>
            </div>
          </div>

          <!-- Attendance register -->
          <div class="lg:col-span-2 bg-white border border-line-1 rounded-card overflow-hidden">
            <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm">Attendance Register -- Last 14 Days</div>
            <div class="overflow-x-auto"><table class="w-full text-sm">
              <thead>
                <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                  <th class="px-4 py-2 font-medium">Date</th>
                  <th class="px-4 py-2 font-medium">Staff</th>
                  <th class="px-4 py-2 font-medium">Check In</th>
                  <th class="px-4 py-2 font-medium">Check Out</th>
                  <th class="px-4 py-2 font-medium">Hours</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngIf="attendance.data().length === 0">
                  <td colspan="5" class="px-4 py-6 text-center text-body-2">No attendance recorded yet.</td>
                </tr>
                <tr *ngFor="let a of recentAttendance()" class="border-b border-line-2 last:border-0">
                  <td class="px-4 py-2 font-mono text-[12.5px] text-body-1">{{ a.attendance_date }}</td>
                  <td class="px-4 py-2 text-ink-2 font-medium">{{ staffNameFor(a.staff_id) }}</td>
                  <td class="px-4 py-2 font-mono text-[12px] text-body-1">{{ a.check_in_at ? (a.check_in_at | date: 'shortTime') : '—' }}</td>
                  <td class="px-4 py-2 font-mono text-[12px] text-body-1">{{ a.check_out_at ? (a.check_out_at | date: 'shortTime') : '—' }}</td>
                  <td class="px-4 py-2 font-mono text-[12px] text-body-1">{{ a.check_out_at ? hoursWorked(a) : '—' }}</td>
                </tr>
              </tbody>
            </table></div>
          </div>
        </div>
      </div>

      <!-- Capture modal for check-in/out -->
      <div *ngIf="capturingMode" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" (click)="capturingMode = null">
        <div (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-sm space-y-3">
          <h3 class="font-semibold text-ink-2">{{ capturingMode === 'in' ? 'Check In' : 'Check Out' }}</h3>
          <app-attendance-capture (captureReady)="onCaptured($event)"></app-attendance-capture>
          <button type="button" (click)="capturingMode = null" class="w-full border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
        </div>
      </div>

      <!-- ================= ONBOARDING ================= -->
      <div *ngIf="activeTab === 'onboarding'" class="flex flex-col gap-3">
        <div class="text-[11.5px] text-[#5f7689] bg-[#f7f9fb] border border-line-1 rounded-[9px] px-3 py-2">
          <b class="text-[#22384a]">DPDP Act 2023 note:</b> this checklist collects Aadhaar, PAN, bank details, and
          health screening data -- all "personal data" under the Digital Personal Data Protection Act. The DPDP
          Rules were notified 13 Nov 2025; full substantive obligations (consent notices, breach reporting, data
          principal rights) and penalties (up to ₹250 crore) take effect 13 May 2027 -- not yet actively enforced,
          but this is the window to build consent capture and retention-limit practices ahead of that deadline,
          not after it.
        </div>
        <div class="flex justify-end">
          <button (click)="showNewOnboarding = true" class="bg-brand hover:bg-brand-hover text-white rounded-[9px] px-4 py-2 text-[12.5px] font-semibold">+ New Onboarding</button>
        </div>
        <div *ngIf="onboarding.data().length === 0" class="text-center text-body-2 text-sm py-8 bg-white border border-[#e7ecf2] rounded-[13px]">No onboarding records yet.</div>
        <div *ngFor="let o of onboarding.data()" class="bg-white border border-[#e7ecf2] rounded-[13px] px-[18px] py-[16px]">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div class="font-semibold text-[14.5px] text-[#22384a]">{{ o.name }}</div>
              <div class="text-[12px] text-[#8094a6] mt-0.5">{{ o.position }} · {{ o.dept }} · Joins {{ o.join_date }}</div>
              <div class="text-[11.5px] text-brand mt-0.5 font-semibold">{{ o.employment_type }} · ₹{{ o.monthly_rate | number }}/mo</div>
            </div>
            <span class="px-[11px] py-1 rounded-pill text-[11px] font-semibold" [style.background]="pillStyle(o.stage).bg" [style.color]="pillStyle(o.stage).fg">{{ o.stage }}</span>
          </div>
          <div class="h-[6px] bg-[#eef2f6] rounded-[5px] overflow-hidden mt-3">
            <div class="h-full bg-brand" [style.width]="onboardingProgress(o) + '%'"></div>
          </div>

          <div class="text-[10.5px] font-bold tracking-[.6px] text-brand uppercase pt-[14px] pb-[6px]">Document Checklist</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-[7px]">
            <button *ngFor="let d of o.doc_checklist; let i = index" type="button" (click)="toggleDoc(o, i)"
              class="flex items-center gap-2 text-left bg-white border border-line-1 rounded-[9px] px-[10px] py-2 hover:border-brand">
              <span class="w-4 h-4 rounded-[5px] border flex items-center justify-center text-[10px] text-white flex-none"
                [style.background]="d.done ? '#0d8c80' : '#fff'" [style.border-color]="d.done ? '#0d8c80' : '#dde5ee'">
                <i *ngIf="d.done" class="ph ph-check"></i>
              </span>
              <span class="text-[11.5px] font-medium text-[#26404f]">{{ d.label }}</span>
            </button>
          </div>

          <!-- Credential expiry tracking, only relevant for clinical roles --
               NABH's HRM chapter specifically requires registration renewal
               dates with expiry alerts, not just a one-time verification. -->
          <div *ngIf="o.employment_type === 'Medical Officer' || o.employment_type === 'Consultant'" class="mt-3 flex items-center gap-3 flex-wrap">
            <label class="text-[11px] font-medium text-body-1">Medical Council registration expiry:</label>
            <input type="date" [ngModel]="o.credential_expiry" (ngModelChange)="updateCredentialExpiry(o, $event)"
              class="border border-line-1 rounded-[7px] px-2 py-1 text-[11.5px]" />
            <span *ngIf="credentialAlert(o.credential_expiry) as alert" class="px-2 py-0.5 rounded-pill text-[10.5px] font-semibold"
              [style.background]="alert.bg" [style.color]="alert.fg">{{ alert.text }}</span>
          </div>

          <div class="text-[10.5px] font-bold tracking-[.6px] text-brand uppercase pt-[14px] pb-[6px]">IT, Access &amp; Induction</div>
          <div class="flex gap-2 flex-wrap">
            <button type="button" (click)="toggleFlag(o, 'it_access')" class="flex items-center gap-2 bg-white border border-line-1 rounded-[9px] px-[12px] py-2 hover:border-brand">
              <span class="w-4 h-4 rounded-[5px] border flex items-center justify-center text-[10px] text-white flex-none"
                [style.background]="o.it_access ? '#0d8c80' : '#fff'" [style.border-color]="o.it_access ? '#0d8c80' : '#dde5ee'"><i *ngIf="o.it_access" class="ph ph-check"></i></span>
              <span class="text-[11.5px] font-medium text-[#26404f]">IT / System Access</span>
            </button>
            <button type="button" (click)="toggleFlag(o, 'id_card_issued')" class="flex items-center gap-2 bg-white border border-line-1 rounded-[9px] px-[12px] py-2 hover:border-brand">
              <span class="w-4 h-4 rounded-[5px] border flex items-center justify-center text-[10px] text-white flex-none"
                [style.background]="o.id_card_issued ? '#0d8c80' : '#fff'" [style.border-color]="o.id_card_issued ? '#0d8c80' : '#dde5ee'"><i *ngIf="o.id_card_issued" class="ph ph-check"></i></span>
              <span class="text-[11.5px] font-medium text-[#26404f]">ID Card Issued</span>
            </button>
            <button type="button" (click)="toggleFlag(o, 'induction_done')" class="flex items-center gap-2 bg-white border border-line-1 rounded-[9px] px-[12px] py-2 hover:border-brand">
              <span class="w-4 h-4 rounded-[5px] border flex items-center justify-center text-[10px] text-white flex-none"
                [style.background]="o.induction_done ? '#0d8c80' : '#fff'" [style.border-color]="o.induction_done ? '#0d8c80' : '#dde5ee'"><i *ngIf="o.induction_done" class="ph ph-check"></i></span>
              <span class="text-[11.5px] font-medium text-[#26404f]">Induction Completed</span>
            </button>
          </div>

          <div class="flex justify-end gap-2 mt-3">
            <button *ngIf="o.stage === 'Completed'" (click)="convertToStaff(o)"
              class="bg-[#ece8fb] text-[#5536c9] border border-[#d9d0f6] rounded-[7px] px-3 py-[7px] text-[11.5px] font-semibold hover:bg-[#e2dbf9]">
              Add to Staff Directory
            </button>
            <button *ngIf="onboardingNextStage(o.stage)" (click)="advanceOnboarding(o)"
              class="bg-[#eaf5f3] text-[#0a6a60] border border-[#c9e7e2] rounded-[7px] px-3 py-[7px] text-[11.5px] font-semibold hover:bg-[#dff0ed]">
              {{ onboardingNextStage(o.stage) }}
            </button>
          </div>
        </div>
      </div>

      <!-- ================= EXIT ================= -->
      <div *ngIf="activeTab === 'exit'" class="flex flex-col gap-3">
        <div class="flex justify-end">
          <button (click)="showNewExit = true" class="bg-brand hover:bg-brand-hover text-white rounded-[9px] px-4 py-2 text-[12.5px] font-semibold">+ New Exit</button>
        </div>
        <div *ngIf="exits.data().length === 0" class="text-center text-body-2 text-sm py-8 bg-white border border-[#e7ecf2] rounded-[13px]">No exits in progress.</div>
        <div *ngFor="let e of exits.data()" class="bg-white border border-[#e7ecf2] rounded-[13px] px-[18px] py-[16px]">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div class="font-semibold text-[14.5px] text-[#22384a]">{{ e.name }}</div>
              <div class="text-[12px] text-[#8094a6] mt-0.5">{{ e.employee_id }} · {{ e.position }} · {{ e.dept }} · {{ e.employment_type }}</div>
            </div>
            <span class="px-[11px] py-1 rounded-pill text-[11px] font-semibold" [style.background]="pillStyle(e.stage).bg" [style.color]="pillStyle(e.stage).fg">{{ e.stage }}</span>
          </div>
          <div class="text-[12px] text-[#5f7689] mt-2">Notice: {{ e.notice_date }} → Last day {{ e.last_day }} · Reason: {{ e.reason }}</div>

          <div class="text-[10.5px] font-bold tracking-[.6px] text-brand uppercase pt-[14px] pb-[6px]">Clearance Checklist</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-[7px]">
            <button *ngFor="let c of e.clearance_checklist; let i = index" type="button" (click)="toggleClearance(e, i)"
              class="flex items-center gap-2 text-left bg-white border border-line-1 rounded-[9px] px-[10px] py-2 hover:border-brand">
              <span class="w-4 h-4 rounded-[5px] border flex items-center justify-center text-[10px] text-white flex-none"
                [style.background]="c.done ? '#0d8c80' : '#fff'" [style.border-color]="c.done ? '#0d8c80' : '#dde5ee'">
                <i *ngIf="c.done" class="ph ph-check"></i>
              </span>
              <span class="text-[11.5px] font-medium text-[#26404f]">{{ c.label }}</span>
            </button>
          </div>

          <div *ngIf="e.settlement && e.settlement.length > 0">
            <div class="text-[10.5px] font-bold tracking-[.6px] text-brand uppercase pt-[14px] pb-[6px]">Full &amp; Final Settlement</div>
            <div *ngFor="let s of e.settlement" class="flex justify-between py-1.5 border-b border-[#f2f5f8] text-[12.5px] text-[#3f566a]">
              <span>{{ s.label }}</span><span class="font-mono font-semibold text-[#12303f]">₹{{ s.value | number }}</span>
            </div>
            <div class="mt-2 text-[11px] rounded-[8px] px-[10px] py-[7px]" [class]="ffDeadline(e).overdue ? 'bg-danger-bg text-danger-fg' : 'bg-[#f7f9fb] text-[#5f7689]'">
              <i class="ph ph-clock-countdown"></i>
              F&amp;F must be paid within 2 working days of the last working day ({{ e.last_day }}) -- due {{ ffDeadline(e).date }} ({{ ffDeadline(e).label }})
            </div>
          </div>

          <div *ngIf="e.exit_interview" class="mt-3 text-[12px] text-[#5f7689] bg-[#f7f9fb] rounded-[9px] px-[11px] py-[9px]">
            <b>Exit Interview:</b> {{ e.exit_interview }}
          </div>

          <div class="flex items-center justify-between mt-3">
            <span *ngIf="e.relieving_issued" class="text-[11.5px] text-[#0b7d72] font-semibold"><i class="ph ph-check-circle"></i> Relieving &amp; experience letter issued</span>
            <div class="ml-auto flex gap-2">
              <button *ngIf="e.stage === 'Settlement' && (!e.settlement || e.settlement.length === 0)" (click)="openSettlement(e)"
                class="bg-[#e4edfb] text-[#2257a3] border border-[#c9dbf5] rounded-[7px] px-3 py-[7px] text-[11.5px] font-semibold hover:bg-[#d8e5f9]">
                Compute Settlement
              </button>
              <button *ngIf="exitNextStage(e.stage)" (click)="advanceExit(e)"
                class="bg-[#eaf5f3] text-[#0a6a60] border border-[#c9e7e2] rounded-[7px] px-3 py-[7px] text-[11.5px] font-semibold hover:bg-[#dff0ed]">
                {{ exitNextStage(e.stage) }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= SALARY STRUCTURE ================= -->
      <div *ngIf="activeTab === 'salary'" class="flex flex-col gap-[14px]">
        <app-kpi-row [items]="salaryOverviewKpis()"></app-kpi-row>

        <!-- Statutory Registration Numbers -- real payroll setup always
             starts here: without these identifiers, you cannot legally
             file PF/ESI/PT returns for anyone, regardless of how correct
             the per-employee math is. Maharashtra specifically requires
             BOTH PTEC (company's own registration) and PTRC (authorization
             to deduct from employees) -- missing PTEC is the single most
             common PT audit finding. -->
        <div class="bg-white border border-[#e7ecf2] rounded-[14px] p-[16px_18px]">
          <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div>
              <h3 class="m-0 text-[14px] font-semibold text-[#1c3a4d]">Statutory Registration Numbers</h3>
              <div class="text-[12px] text-[#8094a6] mt-[3px]">Required before any statutory return can be legally filed for this hospital.</div>
            </div>
            <span class="px-[10px] py-1 rounded-pill text-[11px] font-semibold"
              [style.background]="registrationCompleteness().pct === 100 ? '#dff1ef' : '#fdf0d8'"
              [style.color]="registrationCompleteness().pct === 100 ? '#0b7d72' : '#946200'">
              {{ registrationCompleteness().filled }}/{{ registrationCompleteness().total }} configured
            </span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[12px]" *ngIf="statutoryRegistrations.data()[0] as reg">
            <div>
              <label class="block text-[10px] font-semibold text-muted-1 uppercase mb-1">PF Establishment Code</label>
              <input [ngModel]="reg.pf_establishment_code" (ngModelChange)="updateRegistrationField('pf_establishment_code', $event)"
                placeholder="e.g. MH/BAN/1234567/000" class="w-full px-2.5 py-1.5 border border-line-1 rounded-[7px] text-[12.5px] font-mono" />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-muted-1 uppercase mb-1">ESI Employer Code</label>
              <input [ngModel]="reg.esi_employer_code" (ngModelChange)="updateRegistrationField('esi_employer_code', $event)"
                placeholder="e.g. 12345678900001234" class="w-full px-2.5 py-1.5 border border-line-1 rounded-[7px] text-[12.5px] font-mono" />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-muted-1 uppercase mb-1">PT — PTEC (company)</label>
              <input [ngModel]="reg.pt_ptec_number" (ngModelChange)="updateRegistrationField('pt_ptec_number', $event)"
                placeholder="11-digit TIN" class="w-full px-2.5 py-1.5 border border-line-1 rounded-[7px] text-[12.5px] font-mono" />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-muted-1 uppercase mb-1">PT — PTRC (employee deduction)</label>
              <input [ngModel]="reg.pt_ptrc_number" (ngModelChange)="updateRegistrationField('pt_ptrc_number', $event)"
                placeholder="12-digit TIN" class="w-full px-2.5 py-1.5 border border-line-1 rounded-[7px] text-[12.5px] font-mono" />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-muted-1 uppercase mb-1">TAN (for TDS deposits)</label>
              <input [ngModel]="reg.tan_number" (ngModelChange)="updateRegistrationField('tan_number', $event)"
                placeholder="e.g. MUMA12345B" class="w-full px-2.5 py-1.5 border border-line-1 rounded-[7px] text-[12.5px] font-mono" />
            </div>
          </div>
        </div>

        <!-- Individual employee salary -- the type-level master below sets
             POLICY (what % is Basic, what statutory rules apply), but says
             nothing about what any specific person actually earns. This is
             that missing per-employee view: every staff member, their
             actual monthly salary, editable inline. -->
        <div class="bg-white border border-[#e7ecf2] rounded-[14px] overflow-hidden">
          <div class="px-[18px] py-[14px] border-b border-[#eef2f6]">
            <h3 class="m-0 text-[14px] font-semibold text-[#1c3a4d]">Individual Employee Salary</h3>
            <div class="text-[12px] text-[#8094a6] mt-[3px]">
              Actual monthly CTC per person -- the type-level structure below sets policy, this is what each
              employee actually earns. Gender is needed for accurate Professional Tax (Maharashtra exempts
              women up to ₹25,000/month).
            </div>
          </div>
          <div class="overflow-x-auto"><table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                <th class="px-4 py-2 font-medium">Name</th>
                <th class="px-4 py-2 font-medium">Type</th>
                <th class="px-4 py-2 font-medium">Gender</th>
                <th class="px-4 py-2 font-medium">PF UAN</th>
                <th class="px-4 py-2 font-medium">ESI No.</th>
                <th class="px-4 py-2 font-medium">Bank A/C</th>
                <th class="px-4 py-2 font-medium">Monthly CTC</th>
                <th class="px-4 py-2 font-medium">Net Pay</th>
                <th class="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngIf="staff.data().length === 0">
                <td colspan="9" class="px-4 py-6 text-center text-body-2">No staff on record yet.</td>
              </tr>
              <tr *ngFor="let s of staff.data()" class="border-b border-line-2 last:border-0">
                <td class="px-4 py-2">
                  <div class="font-medium text-ink-2">{{ s.full_name }}</div>
                  <div class="text-[11px] text-muted-1">{{ s.title }} · {{ s.department }}</div>
                </td>
                <td class="px-4 py-2">
                  <span class="px-2 py-0.5 rounded-pill text-[10.5px] font-semibold"
                    [style.background]="employmentTypeTint(s.employment_type).bg" [style.color]="employmentTypeTint(s.employment_type).fg">
                    {{ s.employment_type || '—' }}
                  </span>
                </td>
                <td class="px-4 py-2">
                  <select [ngModel]="s.gender" (ngModelChange)="updateStaffField(s, 'gender', $event)" class="border border-line-1 rounded-[7px] px-1.5 py-1 text-[11.5px]">
                    <option [ngValue]="null">—</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </td>
                <td class="px-4 py-2">
                  <input [ngModel]="s.pf_uan" (ngModelChange)="updateStaffField(s, 'pf_uan', $event)" placeholder="—"
                    class="w-[110px] px-1.5 py-1 border border-line-1 rounded-[7px] text-[11px] font-mono" />
                </td>
                <td class="px-4 py-2">
                  <input [ngModel]="s.esi_number" (ngModelChange)="updateStaffField(s, 'esi_number', $event)" placeholder="—"
                    class="w-[110px] px-1.5 py-1 border border-line-1 rounded-[7px] text-[11px] font-mono" />
                </td>
                <td class="px-4 py-2">
                  <input [ngModel]="s.bank_account_number" (ngModelChange)="updateStaffField(s, 'bank_account_number', $event)" placeholder="—"
                    class="w-[110px] px-1.5 py-1 border border-line-1 rounded-[7px] text-[11px] font-mono" />
                </td>
                <td class="px-4 py-2">
                  <div class="flex items-center gap-1">
                    <span class="text-body-1 text-[11.5px]">₹</span>
                    <input type="number" min="0" [ngModel]="s.monthly_salary" (ngModelChange)="updateStaffSalary(s, $event)"
                      placeholder="Not set"
                      class="w-[95px] px-2 py-1 border rounded-[7px] text-[12px] font-mono font-semibold"
                      [class]="s.monthly_salary == null ? 'border-warning-fg bg-warning-bg' : 'border-line-1'" />
                  </div>
                </td>
                <td class="px-4 py-2 font-mono text-[12px] font-semibold text-[#12303f]">
                  {{ s.monthly_salary != null ? '₹' + (netPayFor(s) | number) : '—' }}
                </td>
                <td class="px-4 py-2">
                  <button *ngIf="s.monthly_salary != null" (click)="printPayslip(s)" title="Print payslip"
                    class="border border-line-1 bg-white hover:bg-line-2 rounded-[7px] w-[26px] h-[26px] flex items-center justify-center">
                    <i class="ph ph-printer text-[13px] text-body-1"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table></div>
        </div>

        <!-- Printable payslip, hidden on screen -->
        <div *ngIf="printingPayslip" class="print-area hidden">
          <app-print-letterhead title="Payslip"></app-print-letterhead>
          <div style="font-size:13px; margin-bottom:16px;">
            <div style="font-weight:600; color:#12303f;">{{ printingPayslip.full_name }}</div>
            <div style="color:#5f7689;">{{ printingPayslip.title }} · {{ printingPayslip.department }} · {{ printingPayslip.employment_type }}</div>
            <div style="color:#8094a6; font-size:11px;">PF UAN: {{ printingPayslip.pf_uan || '—' }} · ESI No: {{ printingPayslip.esi_number || '—' }}</div>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <tbody>
              <tr *ngFor="let line of printingPayslipLines" style="border-bottom:1px solid #f1f4f8;">
                <td style="padding:6px 0; color:#5f7689;">{{ line.label }}</td>
                <td style="padding:6px 0; text-align:right; font-family:monospace;" [style.color]="line.value < 0 ? '#b42318' : '#12303f'">
                  {{ line.value < 0 ? '-' : '' }}₹{{ (line.value < 0 ? -line.value : line.value) | number }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="bg-white border border-[#e7ecf2] rounded-[14px] overflow-hidden">
          <div class="px-[18px] py-[14px] border-b border-[#eef2f6]">
            <h3 class="m-0 text-[14px] font-semibold text-[#1c3a4d]">Salary Structure Master — by Employment Type</h3>
            <div class="text-[12px] text-[#8094a6] mt-[3px]">Pay components + statutory applicability, per Indian payroll compliance norms.</div>
            <div class="flex items-start gap-2 text-[11px] text-[#5f7689] bg-[#f7f9fb] rounded-[8px] px-[10px] py-[7px] mt-[9px]">
              <i class="ph ph-info mt-0.5 flex-none"></i>
              <span><b>Statutory Bonus (Payment of Bonus Act 1965):</b> minimum 8.33% of Basic+DA (max 20%), mandatory for
              employees earning up to ₹21,000/month, payable within 8 months of financial year end — an annual
              computation, not reflected in the monthly figures below.</span>
            </div>
          </div>

          <div *ngFor="let r of salaryStructures.data()" class="border-b border-[#f1f4f8] last:border-0">
            <div class="px-[18px] py-[16px]">
              <!-- Header row: icon, type name, headcount, TDS treatment -->
              <div class="flex items-center gap-[12px] flex-wrap">
                <span class="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-none"
                  [style.background]="employmentTypeTint(r.employment_type).bg">
                  <i class="ph {{ employmentTypeIcon(r.employment_type) }} text-[18px]" [style.color]="employmentTypeTint(r.employment_type).fg"></i>
                </span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-[9px] flex-wrap">
                    <span class="font-semibold text-[14.5px] text-[#22384a]">{{ r.employment_type }}</span>
                    <span class="px-2 py-0.5 rounded-pill text-[10.5px] font-semibold bg-[#eef2f6] text-[#5f7689]">
                      {{ staffCountFor(r.employment_type) }} staff
                    </span>
                  </div>
                  <div class="text-[11px] text-[#9aabbb] mt-[2px]">TDS treatment: {{ r.tds_note }}</div>
                </div>
              </div>

              <div *ngIf="r.employment_type === 'Consultant'" class="mt-3 text-[11.5px] text-warning-fg bg-warning-bg rounded-[8px] px-[11px] py-[8px] flex items-start gap-2">
                <i class="ph ph-warning mt-0.5 flex-none"></i>
                <span>
                  Paid as <b>Professional Fees</b>, not payroll salary. TDS deducted under Section 194J (10%), not
                  Section 192 (salary slab rates) — must use a separate ledger/challan from employee salary.
                </span>
              </div>
              <div *ngIf="r.employment_type === 'Medical Officer'" class="mt-3 text-[11.5px] text-[#5f7689] bg-[#f7f9fb] rounded-[8px] px-[11px] py-[8px]">
                NPA (Non-Practicing Allowance) applies to doctors who forgo private practice — counted as Pay for DA
                and retirement benefits, but excluded from the HRA calculation base.
              </div>

              <!-- Pay structure inputs + illustrative payslip breakdown, side by side -->
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-[18px] mt-[14px]">
                <div>
                  <div class="text-[10px] font-bold tracking-[.5px] text-[#9aabbb] uppercase mb-2">Pay Components</div>
                  <div class="grid grid-cols-3 gap-[10px]">
                    <div>
                      <label class="block text-[10px] font-medium text-muted-1 mb-1">Basic %</label>
                      <input type="number" min="0" max="100" [ngModel]="r.basic_pct" (ngModelChange)="updateSalaryField(r, 'basic_pct', $event)"
                        class="w-full px-2 py-1.5 border border-line-1 rounded-[7px] text-[12.5px] font-mono font-semibold" />
                    </div>
                    <div>
                      <label class="block text-[10px] font-medium text-muted-1 mb-1">HRA % of Basic</label>
                      <input type="number" min="0" max="100" [ngModel]="r.hra_pct" (ngModelChange)="updateSalaryField(r, 'hra_pct', $event)"
                        class="w-full px-2 py-1.5 border border-line-1 rounded-[7px] text-[12.5px] font-mono font-semibold" />
                    </div>
                    <div>
                      <label class="block text-[10px] font-medium text-muted-1 mb-1">Conveyance ₹</label>
                      <input type="number" min="0" [ngModel]="r.conveyance" (ngModelChange)="updateSalaryField(r, 'conveyance', $event)"
                        class="w-full px-2 py-1.5 border border-line-1 rounded-[7px] text-[12.5px] font-mono font-semibold" />
                    </div>
                  </div>

                  <div class="text-[10px] font-bold tracking-[.5px] text-[#9aabbb] uppercase mt-4 mb-2">Statutory Applicability</div>
                  <div class="flex gap-[6px] flex-wrap">
                    <button (click)="toggleStatutory(r, 'pf_applicable')" class="flex items-center gap-1.5 rounded-pill px-[11px] py-1.5 text-[10.5px] font-semibold"
                      [style.background]="r.pf_applicable ? '#dff1ef' : '#eef2f6'" [style.color]="r.pf_applicable ? '#0b7d72' : '#8094a6'">
                      <i class="ph {{ r.pf_applicable ? 'ph-check-circle' : 'ph-x-circle' }}"></i>PF
                    </button>
                    <button (click)="toggleStatutory(r, 'esi_applicable')" class="flex items-center gap-1.5 rounded-pill px-[11px] py-1.5 text-[10.5px] font-semibold"
                      [style.background]="r.esi_applicable ? '#dff1ef' : '#eef2f6'" [style.color]="r.esi_applicable ? '#0b7d72' : '#8094a6'">
                      <i class="ph {{ r.esi_applicable ? 'ph-check-circle' : 'ph-x-circle' }}"></i>ESI
                    </button>
                    <button (click)="toggleStatutory(r, 'pt_applicable')" class="flex items-center gap-1.5 rounded-pill px-[11px] py-1.5 text-[10.5px] font-semibold"
                      [style.background]="r.pt_applicable ? '#dff1ef' : '#eef2f6'" [style.color]="r.pt_applicable ? '#0b7d72' : '#8094a6'">
                      <i class="ph {{ r.pt_applicable ? 'ph-check-circle' : 'ph-x-circle' }}"></i>PT
                    </button>
                    <button (click)="toggleStatutory(r, 'gratuity_applicable')" class="flex items-center gap-1.5 rounded-pill px-[11px] py-1.5 text-[10.5px] font-semibold"
                      [style.background]="r.gratuity_applicable ? '#dff1ef' : '#eef2f6'" [style.color]="r.gratuity_applicable ? '#0b7d72' : '#8094a6'">
                      <i class="ph {{ r.gratuity_applicable ? 'ph-check-circle' : 'ph-x-circle' }}"></i>Gratuity
                    </button>
                  </div>
                </div>

                <!-- Illustrative payslip breakdown for a representative CTC -->
                <div class="bg-[#f7f9fb] rounded-[10px] p-[14px]">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-[10px] font-bold tracking-[.5px] text-[#9aabbb] uppercase">Illustrative Payslip</span>
                    <span class="text-[10.5px] text-[#9aabbb]">at ₹{{ illustrativeCtc(r.employment_type) | number }}/mo CTC</span>
                  </div>
                  <ng-container *ngFor="let line of payslipLines(r)">
                    <div *ngIf="line.section" class="text-[10px] font-bold tracking-[.4px] text-[#9aabbb] uppercase pt-2 pb-0.5">{{ line.label }}</div>
                    <div *ngIf="!line.section" class="flex justify-between py-[5px] text-[12px]" [class]="line.bold ? 'border-t border-[#e2e8ee] mt-1 pt-2 font-semibold' : ''">
                      <span [class]="line.bold ? 'text-[#22384a]' : 'text-[#5f7689]'">{{ line.label }}</span>
                      <span class="font-mono" [class]="line.bold ? 'text-[#12303f]' : (line.value < 0 ? 'text-danger-fg' : 'text-[#3f566a]')">
                        {{ line.value < 0 ? '-' : '' }}₹{{ (line.value < 0 ? -line.value : line.value) | number }}
                      </span>
                    </div>
                  </ng-container>
                </div>
              </div>

              <!-- Real PF/ESI/TDS aggregate, collapsed by default -->
              <button type="button" (click)="toggleBreakdown(r.employment_type)" class="flex items-center gap-1.5 mt-4 text-[11.5px] font-semibold text-brand">
                <i class="ph {{ isBreakdownOpen(r.employment_type) ? 'ph-caret-down' : 'ph-caret-right' }}"></i>
                Real statutory contribution total {{ staffCountFor(r.employment_type) > 0 ? '(' + staffCountFor(r.employment_type) + ' staff)' : '' }}
              </button>
              <div *ngIf="isBreakdownOpen(r.employment_type)" class="mt-3 pt-3 border-t border-[#f1f4f8]">
                <div *ngIf="staffWithSalaryFor(r.employment_type).length === 0" class="text-[11px] text-muted-1">
                  No staff with recorded monthly salary in this employment type yet — add a salary via "+ New Staff" or onboarding conversion to see real figures here.
                </div>
                <div *ngIf="staffWithSalaryFor(r.employment_type).length > 0" class="grid grid-cols-2 sm:grid-cols-6 gap-3 text-[11.5px]">
                  <div>
                    <div class="text-[#8094a6] text-[10px] uppercase font-semibold">Employee PF/mo</div>
                    <div class="font-mono font-semibold text-[#22384a]">₹{{ statutoryTotals(r).employeePF | number }}</div>
                  </div>
                  <div>
                    <div class="text-[#8094a6] text-[10px] uppercase font-semibold">Employer PF+EDLI/mo</div>
                    <div class="font-mono font-semibold text-[#22384a]">₹{{ statutoryTotals(r).employerTotal | number }}</div>
                  </div>
                  <div>
                    <div class="text-[#8094a6] text-[10px] uppercase font-semibold">Employee ESI/mo</div>
                    <div class="font-mono font-semibold text-[#22384a]">₹{{ statutoryTotals(r).employeeESI | number }}</div>
                  </div>
                  <div>
                    <div class="text-[#8094a6] text-[10px] uppercase font-semibold">Employer ESI/mo</div>
                    <div class="font-mono font-semibold text-[#22384a]">₹{{ statutoryTotals(r).employerESI | number }}</div>
                  </div>
                  <div>
                    <div class="text-[#8094a6] text-[10px] uppercase font-semibold">Est. TDS/mo (new regime)</div>
                    <div class="font-mono font-semibold text-[#22384a]">₹{{ statutoryTotals(r).estimatedTDS | number }}</div>
                  </div>
                  <div>
                    <div class="text-[#8094a6] text-[10px] uppercase font-semibold">Professional Tax/mo (all staff)</div>
                    <div class="font-mono font-semibold text-[#22384a]">₹{{ statutoryTotals(r).totalPT | number }}</div>
                  </div>
                </div>
                <div *ngIf="staffWithSalaryFor(r.employment_type).length > 0" class="text-[10.5px] text-muted-1 mt-1.5">
                  ESI wage ceiling is ₹21,000/month — staff above this are correctly excluded.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= PAYROLL & COMPLIANCE ================= -->
      <div *ngIf="activeTab === 'payroll'" class="flex flex-col gap-[14px]">
        <!-- Payroll cycle: Run -> Validate -> Lock -->
        <div class="bg-white border border-[#e7ecf2] rounded-[14px] p-[18px]">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 class="m-0 text-[14px] font-semibold text-[#1c3a4d]">Payroll Cycle -- {{ currentPeriod() }}</h3>
              <div class="text-[12px] text-[#8094a6] mt-[3px]">Run, validate and lock the monthly payroll cycle. Locking blocks further salary edits until next month.</div>
            </div>
            <span class="px-[12px] py-1.5 rounded-pill text-[11.5px] font-bold"
              [style.background]="currentPayrollRun()?.status === 'Locked' ? '#fbe3e3' : currentPayrollRun()?.status === 'Validated' ? '#dff1ef' : '#eef2f6'"
              [style.color]="currentPayrollRun()?.status === 'Locked' ? '#b42318' : currentPayrollRun()?.status === 'Validated' ? '#0b7d72' : '#5f7689'">
              {{ currentPayrollRun()?.status ?? 'Not Run Yet' }}
            </span>
          </div>

          <div *ngIf="currentPayrollRun() as run" class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 text-[12.5px]">
            <div><div class="text-[#8094a6] text-[10px] uppercase font-semibold">Staff in Run</div><div class="font-mono font-semibold text-[#22384a]">{{ run.staff_count }}</div></div>
            <div><div class="text-[#8094a6] text-[10px] uppercase font-semibold">Total Net Pay</div><div class="font-mono font-semibold text-[#22384a]">₹{{ run.total_net_pay | number }}</div></div>
            <div><div class="text-[#8094a6] text-[10px] uppercase font-semibold">{{ run.status === 'Locked' ? 'Locked At' : run.status === 'Validated' ? 'Validated At' : 'Created' }}</div>
              <div class="font-mono font-semibold text-[#22384a]">{{ (run.locked_at || run.validated_at || run.created_at) | date: 'short' }}</div></div>
          </div>

          <div class="flex gap-2 mt-4 flex-wrap">
            <button (click)="runPayroll()" [disabled]="isPayrollLocked()"
              class="bg-brand hover:bg-brand-hover text-white rounded-[9px] px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50">
              <i class="ph ph-play"></i> {{ currentPayrollRun() ? 'Re-run' : 'Run' }} Payroll
            </button>
            <button *ngIf="currentPayrollRun()?.status === 'Draft'" (click)="validatePayroll()"
              class="border border-line-1 bg-white hover:bg-line-2 rounded-[9px] px-4 py-2 text-[12.5px] font-semibold text-body-1">
              <i class="ph ph-check-circle"></i> Validate
            </button>
            <button *ngIf="currentPayrollRun()?.status === 'Validated'" (click)="lockPayroll()"
              class="bg-danger-fg hover:opacity-90 text-white rounded-[9px] px-4 py-2 text-[12.5px] font-semibold">
              <i class="ph ph-lock-key"></i> Lock Payroll
            </button>
            <button *ngIf="currentPayrollRun()?.status === 'Locked'" (click)="unlockPayroll()"
              class="border border-danger-fg text-danger-fg bg-white hover:bg-danger-bg rounded-[9px] px-4 py-2 text-[12.5px] font-semibold">
              <i class="ph ph-lock-key-open"></i> Unlock (requires reason)
            </button>
          </div>
          <div *ngIf="currentPayrollRun()?.unlock_reason" class="mt-3 text-[11.5px] text-warning-fg bg-warning-bg rounded-[8px] px-3 py-2">
            <b>Previously unlocked</b> ({{ currentPayrollRun().unlocked_at | date: 'medium' }}): "{{ currentPayrollRun().unlock_reason }}"
          </div>
        </div>

        <!-- AI-style Pre-Payroll Anomaly Detection, matching the reference's
             pattern but computed from real data -- every anomaly type below
             is a genuinely checkable condition, not a fictional example. -->
        <div class="bg-white border border-[#e7ecf2] rounded-[14px] p-[18px]">
          <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div>
              <h3 class="m-0 text-[14px] font-semibold text-[#1c3a4d]">Pre-Payroll Anomaly Detection</h3>
              <div class="text-[12px] text-[#8094a6] mt-[3px]">Scanned {{ staff.data().length }} staff records.</div>
            </div>
            <span class="px-[11px] py-1 rounded-pill text-[11px] font-bold"
              [style.background]="computeAnomalies().length > 0 ? '#fdeceb' : '#e3f5ec'"
              [style.color]="computeAnomalies().length > 0 ? '#c5362c' : '#1f8a5b'">
              {{ computeAnomalies().length }} open
            </span>
          </div>
          <div *ngIf="computeAnomalies().length === 0" class="text-center text-body-2 text-sm py-6">No anomalies flagged.</div>
          <div *ngFor="let a of computeAnomalies()" class="flex items-start gap-3 py-3 border-b border-[#f1f4f8] last:border-0">
            <span class="px-[9px] py-0.5 rounded-pill text-[10px] font-bold flex-none"
              [style.background]="a.cat === 'danger' ? '#fbe3e3' : a.cat === 'warn' ? '#fdf0d8' : '#e4edfb'"
              [style.color]="a.cat === 'danger' ? '#b42318' : a.cat === 'warn' ? '#946200' : '#2257a3'">
              {{ a.severity }}
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[13px] font-semibold text-[#22384a]">{{ a.title }}</div>
              <div class="text-[12px] text-[#5f7689] mt-[2px]">{{ a.detail }}</div>
            </div>
          </div>
        </div>

        <!-- Compliance Calendar -->
        <div class="bg-white border border-[#e7ecf2] rounded-[14px] overflow-hidden">
          <div class="px-[18px] py-[14px] border-b border-[#eef2f6]">
            <h3 class="m-0 text-[14px] font-semibold text-[#1c3a4d]">Compliance Calendar -- {{ currentPeriod() }}</h3>
            <div class="text-[12px] text-[#8094a6] mt-[3px]">Statutory filing deadlines for the current period.</div>
          </div>
          <div class="overflow-x-auto"><table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                <th class="px-4 py-2 font-medium">Filing</th>
                <th class="px-4 py-2 font-medium">Due Date</th>
                <th class="px-4 py-2 font-medium">Status</th>
                <th class="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of complianceCalendar()" class="border-b border-line-2 last:border-0">
                <td class="px-4 py-2 font-medium text-ink-2">{{ item.filing_type }}</td>
                <td class="px-4 py-2 font-mono text-[12.5px] text-body-1">{{ item.due_date }}</td>
                <td class="px-4 py-2">
                  <span class="px-2 py-0.5 rounded-pill text-[11px] font-semibold"
                    [style.background]="item.status === 'Filed' ? '#dff1ef' : item.status === 'Overdue' ? '#fbe3e3' : '#fdf0d8'"
                    [style.color]="item.status === 'Filed' ? '#0b7d72' : item.status === 'Overdue' ? '#b42318' : '#946200'">
                    {{ item.status }}
                  </span>
                </td>
                <td class="px-4 py-2 text-right">
                  <button *ngIf="item.status !== 'Filed'" (click)="markFiled(item)" class="text-[12px] font-semibold text-brand hover:underline">Mark Filed</button>
                </td>
              </tr>
            </tbody>
          </table></div>
        </div>
      </div>

      <!-- ================= LETTERS ================= -->
      <div *ngIf="activeTab === 'letters'" class="flex flex-col gap-3">
        <div class="flex justify-end">
          <button (click)="showNewLetter = true" class="bg-brand hover:bg-brand-hover text-white rounded-[9px] px-4 py-2 text-[12.5px] font-semibold">+ New Letter</button>
        </div>
        <div *ngIf="letters.data().length === 0" class="text-center text-body-2 text-sm py-8 bg-white border border-[#e7ecf2] rounded-[13px]">No letters yet.</div>
        <div *ngFor="let l of letters.data()" class="bg-white border border-[#e7ecf2] rounded-[13px] px-[18px] py-[14px]">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div class="flex items-center gap-[9px]"><span class="font-mono font-semibold text-[12px] text-brand">{{ shortId(l.id, 'LTR') }}</span><span class="font-semibold text-[#22384a]">{{ l.name }}</span></div>
              <div class="text-[12px] text-[#5f7689] mt-0.5">{{ l.letter_type }}</div>
            </div>
            <span class="px-[10px] py-0.5 rounded-pill text-[11px] font-semibold" [style.background]="l.issued ? '#dff1ef' : '#eef2f6'" [style.color]="l.issued ? '#0b7d72' : '#52677b'">
              {{ l.issued ? 'Issued' : 'Draft' }}
            </span>
          </div>
          <div class="text-[12px] text-[#5f7689] mt-2 bg-[#f7f9fb] rounded-[9px] px-[11px] py-[9px]">{{ l.details }}</div>
          <div class="flex justify-end mt-[10px]">
            <button (click)="issueAndPrintLetter(l)" class="bg-[#eaf5f3] text-[#0a6a60] border border-[#c9e7e2] rounded-[7px] px-3 py-[7px] text-[11.5px] font-semibold hover:bg-[#dff0ed]">
              <i class="ph ph-printer"></i> {{ l.issued ? 'Print again' : 'Issue & Print' }}
            </button>
          </div>
        </div>
      </div>

      <!-- ================= ORG CHART ================= -->
      <div *ngIf="activeTab === 'orgchart'" class="flex flex-col gap-[14px]">
        <div class="bg-white border border-[#e7ecf2] rounded-[14px] p-[16px_18px]">
          <h3 class="m-0 mb-1 text-[14px] font-semibold text-[#1c3a4d]">Reporting Hierarchy</h3>
          <div class="text-[11.5px] text-[#8094a6] mb-3">Organization structure with reporting lines</div>
          <div *ngFor="let n of orgChartRows()" class="flex items-center gap-[10px] py-[9px] border-b border-[#f0f3f7] last:border-0" [style.padding-left.px]="n.indent">
            <span class="w-2 h-2 rounded-full bg-brand flex-none"></span>
            <div class="flex-1 min-w-0">
              <span class="font-semibold text-[13px] text-[#22384a]">{{ n.name }}</span>
              <span class="text-[11.5px] text-[#8094a6] ml-2">{{ n.title }} · {{ n.dept }}</span>
            </div>
            <span class="text-[11px] text-[#9aabbb]">{{ n.managerName ? 'Reports to: ' + n.managerName : 'Top of hierarchy' }}</span>
          </div>
        </div>

        <!-- Real nursing headcount snapshot + NABH's reference ratios. Note:
             this is a staffing snapshot, not a live per-ward compliance
             checker -- an actual ratio calculation needs ward-level patient
             census data (bed occupancy by ward), which lives in IPD/ICU,
             not here. Shown as a reference for manual cross-checking. -->
        <div class="bg-white border border-[#e7ecf2] rounded-[14px] p-[16px_18px]">
          <h3 class="m-0 mb-1 text-[14px] font-semibold text-[#1c3a4d]">Nursing Headcount &amp; NABH Reference Ratios</h3>
          <div class="text-[11.5px] text-[#8094a6] mb-3">
            {{ nursingHeadcount() }} nursing staff on record. Cross-check against current ward census in IPD/ICU for
            actual live compliance -- NABH mandated ratios:
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px]">
            <div class="border border-line-1 rounded-[9px] px-3 py-2">
              <div class="text-[#8094a6] text-[10.5px] uppercase font-semibold">ICU</div>
              <div class="font-mono font-semibold text-[#22384a]">1:1 to 1:2</div>
            </div>
            <div class="border border-line-1 rounded-[9px] px-3 py-2">
              <div class="text-[#8094a6] text-[10.5px] uppercase font-semibold">General Ward</div>
              <div class="font-mono font-semibold text-[#22384a]">1:5 to 1:6</div>
            </div>
            <div class="border border-line-1 rounded-[9px] px-3 py-2">
              <div class="text-[#8094a6] text-[10.5px] uppercase font-semibold">Emergency</div>
              <div class="font-mono font-semibold text-[#22384a]">Unit-specific norms</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= LOANS ================= -->
      <div *ngIf="activeTab === 'loans'" class="flex flex-col gap-2.5">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div class="text-[11.5px] text-[#8094a6] bg-[#f7f9fb] border border-line-1 rounded-[9px] px-3 py-2 max-w-[560px]">
            <b class="text-[#5f7689]">Tax note:</b> interest-free/concessional staff loans exceeding ₹20,000 (aggregate,
            per Rule 3(7)(i)) create a taxable perquisite for the employee -- valued as the gap between the
            SBI lending rate and interest actually charged, added to salary and taxed via TDS. Loans for treatment
            of specified diseases are exempt regardless of amount.
          </div>
          <button (click)="showNewLoan = true" class="bg-brand hover:bg-brand-hover text-white rounded-[9px] px-4 py-2 text-[12.5px] font-semibold flex-none">+ New Loan / Advance</button>
        </div>
        <div *ngIf="loans.data().length === 0" class="text-center text-body-2 text-sm py-8 bg-white border border-[#e7ecf2] rounded-[13px]">No loans or advances yet.</div>
        <div *ngFor="let l of loans.data()" class="bg-white border border-[#e7ecf2] rounded-[12px] px-[16px] py-[14px] flex items-center gap-[14px] flex-wrap">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-[9px] flex-wrap">
              <span class="font-mono font-semibold text-[12px] text-brand">{{ shortId(l.id, 'LN') }}</span>
              <span class="font-semibold text-[#22384a]">{{ l.name }}</span>
              <span class="px-2 py-0.5 rounded-pill text-[10.5px] font-semibold bg-[#eef2f6] text-[#5f7689]">{{ l.loan_type }}</span>
              <span *ngIf="l.amount > 20000 && l.loan_type !== 'Medical Advance'" class="px-2 py-0.5 rounded-pill text-[10.5px] font-semibold bg-warning-bg text-warning-fg">Taxable perquisite</span>
            </div>
            <div class="text-[12px] text-[#5f7689] mt-[3px]">{{ l.reason }} · {{ l.tenure_months }} mo &#64; ₹{{ l.emi | number }}/mo</div>
            <div class="text-[11px] text-[#9aabbb] mt-[2px]">Amount ₹{{ l.amount | number }} · Outstanding ₹{{ l.outstanding | number }}</div>
          </div>
          <span class="px-[10px] py-0.5 rounded-pill text-[11px] font-semibold flex-none" [style.background]="pillStyle(l.stage).bg" [style.color]="pillStyle(l.stage).fg">{{ l.stage }}</span>
          <button *ngIf="loanNextStage(l.stage)" (click)="advanceLoan(l)"
            class="bg-[#eaf5f3] text-[#0a6a60] border border-[#c9e7e2] rounded-[7px] px-3 py-[7px] text-[11.5px] font-semibold hover:bg-[#dff0ed] flex-none">
            {{ loanNextStage(l.stage) }}
          </button>
        </div>
      </div>

      <!-- ================= GRIEVANCE ================= -->
      <div *ngIf="activeTab === 'grievance'" class="flex flex-col gap-2.5">
        <div class="flex justify-end">
          <button (click)="showNewGrievance = true" class="bg-brand hover:bg-brand-hover text-white rounded-[9px] px-4 py-2 text-[12.5px] font-semibold">+ Report Grievance</button>
        </div>
        <div *ngIf="grievances.data().length === 0" class="text-center text-body-2 text-sm py-8 bg-white border border-[#e7ecf2] rounded-[13px]">No grievances reported.</div>
        <div *ngFor="let g of grievances.data()" class="bg-white border border-[#e7ecf2] rounded-[12px] px-[16px] py-[14px]">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="flex items-center gap-[9px] flex-wrap">
              <span class="font-mono font-semibold text-[12px] text-brand">{{ shortId(g.id, 'GRV') }}</span>
              <span class="font-semibold text-[#22384a]">{{ g.name }}</span>
              <span class="px-2 py-0.5 rounded-pill text-[10.5px] font-semibold bg-[#eef2f6] text-[#5f7689]">{{ g.category }}</span>
            </div>
            <span class="px-[10px] py-0.5 rounded-pill text-[11px] font-semibold" [style.background]="pillStyle(g.stage).bg" [style.color]="pillStyle(g.stage).fg">{{ g.stage }}</span>
          </div>
          <div class="text-[12.5px] text-[#5f7689] mt-2">{{ g.description }}</div>

          <!-- Real POSH Act statutory timeline, for Harassment/Discrimination categories --
               Section 11(4): 90 days to complete inquiry from complaint receipt.
               Section 13(1): 10 more days to submit report to employer.
               Section 13(4): 60 days for employer to act on the recommendation.
               These are hard deadlines with no extension clause -- missing them is
               itself a ground the whole inquiry can be challenged on. -->
          <div *ngIf="isPoshCategory(g)" class="mt-2 border border-[#f0c9c5] bg-[#fef4f4] rounded-[9px] px-[12px] py-[10px]">
            <div class="text-[11px] font-bold tracking-[.5px] text-[#b42318] uppercase mb-1.5 flex items-center gap-1.5">
              <i class="ph ph-gavel"></i> POSH Act Statutory Timeline (Sections 11 &amp; 13)
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11.5px]">
              <div>
                <div class="text-[#8094a6]">Inquiry due (90d)</div>
                <div class="font-mono font-semibold" [class]="poshDeadline(g, 90).overdue ? 'text-danger-fg' : 'text-[#22384a]'">
                  {{ poshDeadline(g, 90).date }} ({{ poshDeadline(g, 90).label }})
                </div>
              </div>
              <div>
                <div class="text-[#8094a6]">Report due (+10d)</div>
                <div class="font-mono font-semibold text-[#22384a]">{{ poshDeadline(g, 100).date }}</div>
              </div>
              <div>
                <div class="text-[#8094a6]">Employer action due (+60d)</div>
                <div class="font-mono font-semibold text-[#22384a]">{{ poshDeadline(g, 160).date }}</div>
              </div>
            </div>
            <div class="text-[11px] text-[#946200] mt-2">
              Requires an Internal Committee: Presiding Officer (senior woman), 2+ internal members, 1 external member (NGO/expert), 50%+ women. No extension clause once the 90-day clock starts.
            </div>
          </div>

          <div *ngIf="g.resolution" class="mt-2 text-[12px] text-[#3f566a] bg-[#f7f9fb] rounded-[9px] px-[11px] py-[9px]"><b>Resolution:</b> {{ g.resolution }}</div>
          <div class="flex items-center justify-end gap-2 mt-[11px]">
            <button *ngIf="!g.escalated_posh && g.stage !== 'Resolved'" (click)="escalateGrievance(g)"
              class="bg-[#fbe3e3] text-[#b42318] border border-[#f0c9c5] rounded-[7px] px-3 py-[7px] text-[11.5px] font-semibold hover:bg-[#f8d5d5]">
              Escalate to POSH/Ethics
            </button>
            <button *ngIf="grievanceNextStage(g.stage)" (click)="advanceGrievance(g)"
              class="bg-[#eaf5f3] text-[#0a6a60] border border-[#c9e7e2] rounded-[7px] px-3 py-[7px] text-[11.5px] font-semibold hover:bg-[#dff0ed]">
              {{ grievanceNextStage(g.stage) }}
            </button>
          </div>
        </div>
      </div>

      <!-- ================= MODALS ================= -->

      <!-- New Staff -->
      <div *ngIf="showNewStaff" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="showNewStaff = false">
        <form (ngSubmit)="createStaff()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-sm space-y-3 max-h-[85vh] overflow-y-auto">
          <h3 class="font-semibold text-ink-2">New Staff Member</h3>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Full name</label>
            <input required [(ngModel)]="staffForm.full_name" name="full_name" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Title</label>
            <input [(ngModel)]="staffForm.title" name="title" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="block text-xs font-medium text-body-1 mb-1">Role</label>
              <input required [(ngModel)]="staffForm.role" name="role" placeholder="e.g. nurse" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
            <div><label class="block text-xs font-medium text-body-1 mb-1">Department</label>
              <input required [(ngModel)]="staffForm.department" name="department" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="block text-xs font-medium text-body-1 mb-1">Phone</label>
              <input [(ngModel)]="staffForm.phone" name="phone" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
            <div><label class="block text-xs font-medium text-body-1 mb-1">Email</label>
              <input [(ngModel)]="staffForm.email" name="email" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="block text-xs font-medium text-body-1 mb-1">Employment type</label>
              <select [(ngModel)]="staffForm.employment_type" name="employment_type" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option *ngFor="let t of employmentTypes" [value]="t">{{ t }}</option>
              </select></div>
            <div><label class="block text-xs font-medium text-body-1 mb-1">Date of joining</label>
              <input type="date" [(ngModel)]="staffForm.date_of_joining" name="date_of_joining" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
          </div>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Reports to</label>
            <select [(ngModel)]="staffForm.reporting_manager_id" name="reporting_manager_id" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="">— none —</option>
              <option *ngFor="let s of staff.data()" [value]="s.id">{{ s.full_name }} — {{ s.title }}</option>
            </select></div>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Monthly salary (₹, optional)</label>
            <input type="number" min="0" [(ngModel)]="staffForm.monthly_salary" name="monthly_salary" placeholder="Needed for accurate exit settlements later"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>

          <!-- Live preview: shows exactly how this employee's pay will be
               broken down the moment they're saved -- Basic/HRA/PF/ESI/PT/
               Net Pay all derived from the Salary Structure policy for
               their employment type, computed live as HR fills the form in. -->
          <div *ngIf="staffForm.monthly_salary" class="bg-[#f7f9fb] rounded-[9px] p-3 text-[12px]">
            <div class="text-[10px] font-bold tracking-[.4px] text-[#9aabbb] uppercase mb-1.5">
              Preview -- {{ staffForm.employment_type }} structure applied
            </div>
            <div *ngFor="let line of newStaffPayPreview()" class="flex justify-between py-[3px]" [class]="line.bold ? 'border-t border-[#e2e8ee] mt-1 pt-1.5 font-semibold' : ''">
              <span [class]="line.bold ? 'text-[#22384a]' : 'text-[#5f7689]'">{{ line.label }}</span>
              <span class="font-mono" [class]="line.bold ? 'text-[#12303f]' : (line.value < 0 ? 'text-danger-fg' : 'text-[#3f566a]')">
                {{ line.value < 0 ? '-' : '' }}₹{{ (line.value < 0 ? -line.value : line.value) | number }}
              </span>
            </div>
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="showNewStaff = false" class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" [disabled]="submitting" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold disabled:opacity-60">Add</button>
          </div>
        </form>
      </div>

      <!-- Employee 360 Profile: consolidates Directory, Salary, Attendance,
           Leave, Loans, and Credential status for one person -- previously
           required visiting 6+ separate tabs to piece together. -->
      <div *ngIf="profileStaff as p" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" (click)="closeProfile()">
        <div (click)="$event.stopPropagation()" class="bg-white rounded-card w-full max-w-2xl max-h-[88vh] overflow-y-auto">
          <div class="px-6 py-5 border-b border-line-1 flex items-start justify-between sticky top-0 bg-white z-10">
            <div>
              <h2 class="font-bold text-ink-2 text-[17px]">{{ p.full_name }}</h2>
              <div class="text-[12.5px] text-muted-1 mt-0.5">{{ p.title }} · {{ p.department }} · {{ p.employee_id || 'No ID' }}</div>
            </div>
            <button (click)="closeProfile()" class="text-muted-1 hover:text-body-1 text-xl leading-none">×</button>
          </div>

          <div class="p-6 space-y-5">
            <!-- Employment -->
            <div>
              <div class="text-[10px] font-bold tracking-[.5px] text-[#9aabbb] uppercase mb-2">Employment</div>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12.5px]">
                <div><div class="text-muted-1 text-[10.5px]">Type</div><div class="font-medium text-body-1">{{ p.employment_type || '—' }}</div></div>
                <div><div class="text-muted-1 text-[10.5px]">Joined</div><div class="font-medium text-body-1 font-mono">{{ p.date_of_joining || '—' }}</div></div>
                <div><div class="text-muted-1 text-[10.5px]">Status</div><div class="font-medium text-body-1">{{ p.status || 'Active' }}</div></div>
                <div><div class="text-muted-1 text-[10.5px]">Reports To</div><div class="font-medium text-body-1">{{ p.reporting_manager_id ? staffNameFor(p.reporting_manager_id) : 'Top of hierarchy' }}</div></div>
                <div><div class="text-muted-1 text-[10.5px]">Phone</div><div class="font-medium text-body-1">{{ p.phone || '—' }}</div></div>
                <div><div class="text-muted-1 text-[10.5px]">Email</div><div class="font-medium text-body-1">{{ p.email || '—' }}</div></div>
              </div>
            </div>

            <!-- Pay -->
            <div class="pt-3 border-t border-line-2">
              <div class="text-[10px] font-bold tracking-[.5px] text-[#9aabbb] uppercase mb-2">Pay &amp; Statutory IDs</div>
              <div *ngIf="p.monthly_salary == null" class="text-[12px] text-warning-fg bg-warning-bg rounded-[8px] px-3 py-2">No salary configured yet.</div>
              <div *ngIf="p.monthly_salary != null" class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12.5px]">
                <div><div class="text-muted-1 text-[10.5px]">Monthly CTC</div><div class="font-mono font-semibold text-ink-2">₹{{ p.monthly_salary | number }}</div></div>
                <div><div class="text-muted-1 text-[10.5px]">Net Pay</div><div class="font-mono font-semibold text-success-fg">₹{{ netPayFor(p) | number }}</div></div>
                <div><div class="text-muted-1 text-[10.5px]">PF UAN</div><div class="font-mono text-body-1">{{ p.pf_uan || '—' }}</div></div>
                <div><div class="text-muted-1 text-[10.5px]">ESI No.</div><div class="font-mono text-body-1">{{ p.esi_number || '—' }}</div></div>
                <div><div class="text-muted-1 text-[10.5px]">Bank A/C</div><div class="font-mono text-body-1">{{ maskAccount(p.bank_account_number) }}</div></div>
                <div><div class="text-muted-1 text-[10.5px]">Gender</div><div class="font-medium text-body-1">{{ p.gender || '—' }}</div></div>
              </div>
            </div>

            <!-- Attendance this month -->
            <div class="pt-3 border-t border-line-2">
              <div class="text-[10px] font-bold tracking-[.5px] text-[#9aabbb] uppercase mb-2">Attendance -- {{ currentPeriod() }}</div>
              <div class="text-[12.5px] text-body-1">
                <span class="font-mono font-semibold text-ink-2">{{ profileAttendanceThisMonth(p.id).present }}</span>
                of <span class="font-mono">{{ profileAttendanceThisMonth(p.id).totalDays }}</span> days present
              </div>
            </div>

            <!-- Leave balances -->
            <div class="pt-3 border-t border-line-2">
              <div class="text-[10px] font-bold tracking-[.5px] text-[#9aabbb] uppercase mb-2">Leave Balances</div>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[12px]">
                <div *ngFor="let lb of profileLeaveBalances(p.id)" class="border border-line-1 rounded-[8px] px-2.5 py-1.5">
                  <div class="text-muted-1 text-[10.5px]">{{ lb.type }}</div>
                  <div class="font-mono font-semibold text-body-1">{{ lb.used }}{{ lb.entitlement != null ? ' / ' + lb.entitlement : '' }}</div>
                </div>
              </div>
            </div>

            <!-- Active loans -->
            <div *ngIf="profileActiveLoans(p.id).length > 0" class="pt-3 border-t border-line-2">
              <div class="text-[10px] font-bold tracking-[.5px] text-[#9aabbb] uppercase mb-2">Active Loans</div>
              <div *ngFor="let l of profileActiveLoans(p.id)" class="flex justify-between text-[12.5px] py-1">
                <span class="text-body-1">{{ l.loan_type }} -- {{ l.stage }}</span>
                <span class="font-mono font-semibold text-ink-2">₹{{ l.outstanding | number }} outstanding</span>
              </div>
            </div>

            <!-- Credential status -->
            <div *ngIf="profileCredential(p.id) as cred" class="pt-3 border-t border-line-2">
              <div class="text-[10px] font-bold tracking-[.5px] text-[#9aabbb] uppercase mb-2">Clinical Credential</div>
              <div class="flex items-center gap-2 text-[12.5px]">
                <span class="text-body-1">Medical Council registration expires {{ cred.credential_expiry }}</span>
                <span *ngIf="credentialAlert(cred.credential_expiry) as alert" class="px-2 py-0.5 rounded-pill text-[10.5px] font-semibold"
                  [style.background]="alert.bg" [style.color]="alert.fg">{{ alert.text }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- New Onboarding -->
      <div *ngIf="showNewOnboarding" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="showNewOnboarding = false">
        <form (ngSubmit)="createOnboarding()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-sm space-y-3">
          <h3 class="font-semibold text-ink-2">New Onboarding</h3>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Candidate name</label>
            <input required [(ngModel)]="onboardForm.name" name="name" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="block text-xs font-medium text-body-1 mb-1">Position</label>
              <input required [(ngModel)]="onboardForm.position" name="position" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
            <div><label class="block text-xs font-medium text-body-1 mb-1">Department</label>
              <input required [(ngModel)]="onboardForm.dept" name="dept" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="block text-xs font-medium text-body-1 mb-1">Join date</label>
              <input required type="date" [(ngModel)]="onboardForm.join_date" name="join_date" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
            <div><label class="block text-xs font-medium text-body-1 mb-1">Type</label>
              <select [(ngModel)]="onboardForm.employment_type" name="employment_type" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option *ngFor="let t of employmentTypes" [value]="t">{{ t }}</option>
              </select></div>
          </div>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Monthly rate (₹)</label>
            <input required type="number" min="0" [(ngModel)]="onboardForm.monthly_rate" name="monthly_rate" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="showNewOnboarding = false" class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" [disabled]="submitting" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold disabled:opacity-60">Start onboarding</button>
          </div>
        </form>
      </div>

      <!-- New Exit -->
      <div *ngIf="showNewExit" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="showNewExit = false">
        <form (ngSubmit)="createExit()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-sm space-y-3">
          <h3 class="font-semibold text-ink-2">New Exit</h3>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Staff member</label>
            <select required [(ngModel)]="exitForm.staff_id" name="staff_id" (ngModelChange)="onExitStaffChange()" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="" disabled>Select staff</option>
              <option *ngFor="let s of staff.data()" [value]="s.id">{{ s.full_name }} — {{ s.title }}</option>
            </select></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="block text-xs font-medium text-body-1 mb-1">Notice date</label>
              <input required type="date" [(ngModel)]="exitForm.notice_date" name="notice_date" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
            <div><label class="block text-xs font-medium text-body-1 mb-1">Last day</label>
              <input required type="date" [(ngModel)]="exitForm.last_day" name="last_day" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
          </div>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Reason</label>
            <input required [(ngModel)]="exitForm.reason" name="reason" placeholder="e.g. Resignation, better opportunity" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="showNewExit = false" class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" [disabled]="submitting" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold disabled:opacity-60">Initiate exit</button>
          </div>
        </form>
      </div>

      <!-- New Letter -->
      <div *ngIf="showNewLetter" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="showNewLetter = false">
        <form (ngSubmit)="createLetter()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-sm space-y-3">
          <h3 class="font-semibold text-ink-2">New Letter</h3>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Staff member</label>
            <select required [(ngModel)]="letterForm.staff_id" name="staff_id" (ngModelChange)="onLetterStaffChange()" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="" disabled>Select staff</option>
              <option *ngFor="let s of staff.data()" [value]="s.id">{{ s.full_name }} — {{ s.title }}</option>
            </select></div>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Letter type</label>
            <select [(ngModel)]="letterForm.letter_type" name="letter_type" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let t of letterTypes" [value]="t">{{ t }}</option>
            </select></div>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Details</label>
            <textarea required [(ngModel)]="letterForm.details" name="details" rows="4" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand"></textarea></div>
          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="showNewLetter = false" class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" [disabled]="submitting" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold disabled:opacity-60">Create draft</button>
          </div>
        </form>
      </div>

      <!-- New Loan -->
      <div *ngIf="showNewLoan" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="showNewLoan = false">
        <form (ngSubmit)="createLoan()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-sm space-y-3">
          <h3 class="font-semibold text-ink-2">New Loan / Advance</h3>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Staff member</label>
            <select required [(ngModel)]="loanForm.staff_id" name="staff_id" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="" disabled>Select staff</option>
              <option *ngFor="let s of staff.data()" [value]="s.id">{{ s.full_name }} — {{ s.title }}</option>
            </select></div>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Type</label>
            <select [(ngModel)]="loanForm.loan_type" name="loan_type" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let t of loanTypes" [value]="t">{{ t }}</option>
            </select></div>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Reason</label>
            <input [(ngModel)]="loanForm.reason" name="reason" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="block text-xs font-medium text-body-1 mb-1">Amount (₹)</label>
              <input required type="number" min="0" [(ngModel)]="loanForm.amount" name="amount" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
            <div><label class="block text-xs font-medium text-body-1 mb-1">Tenure (months)</label>
              <input required type="number" min="1" [(ngModel)]="loanForm.tenure_months" name="tenure_months" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" /></div>
          </div>
          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="showNewLoan = false" class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" [disabled]="submitting" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold disabled:opacity-60">Request</button>
          </div>
        </form>
      </div>

      <!-- New Grievance -->
      <div *ngIf="showNewGrievance" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="showNewGrievance = false">
        <form (ngSubmit)="createGrievance()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-sm space-y-3">
          <h3 class="font-semibold text-ink-2">Report Grievance</h3>
          <p class="text-[11.5px] text-muted-1">Reports involving harassment or discrimination can be escalated directly to POSH/Ethics at any stage.</p>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Staff member</label>
            <select required [(ngModel)]="grievanceForm.staff_id" name="staff_id" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="" disabled>Select staff</option>
              <option *ngFor="let s of staff.data()" [value]="s.id">{{ s.full_name }} — {{ s.title }}</option>
            </select></div>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Category</label>
            <select [(ngModel)]="grievanceForm.category" name="category" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let c of grievanceCategories" [value]="c">{{ c }}</option>
            </select></div>
          <div><label class="block text-xs font-medium text-body-1 mb-1">Description</label>
            <textarea required [(ngModel)]="grievanceForm.description" name="description" rows="4" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand"></textarea></div>
          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="showNewGrievance = false" class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" [disabled]="submitting" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold disabled:opacity-60">Submit</button>
          </div>
        </form>
      </div>

      <!-- Printable letter, hidden on screen -->
      <div *ngIf="printingLetter" class="print-area hidden">
        <app-print-letterhead [title]="printingLetter.letter_type"></app-print-letterhead>
        <div style="font-size:13px; margin-bottom:16px;">
          <div style="font-weight:600; color:#12303f;">{{ printingLetter.name }}</div>
          <div style="color:#5f7689; margin-top:2px;">Date: {{ printingLetter.issued_at | date: 'mediumDate' }}</div>
        </div>
        <div style="font-size:13px; line-height:1.6; white-space:pre-wrap;">{{ printingLetter.details }}</div>
        <div style="margin-top:40px; display:flex; justify-content:flex-end;">
          <div style="text-align:center; font-size:11px; color:#8094a6;">
            <div style="border-top:1px solid #dde5ee; padding-top:4px; width:180px;">Authorized signatory</div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class HrComponent implements OnDestroy {
  leaveTypes = LEAVE_TYPES;
  employmentTypes = EMPLOYMENT_TYPES;
  loanTypes = LOAN_TYPES;
  letterTypes = LETTER_TYPES;
  grievanceCategories = GRIEVANCE_CATEGORIES;
  shortId = shortId;
  pillStyle = pillStyle;

  activeTab: HrTab = 'directory';
  tabs: { key: HrTab; label: string; icon: string }[] = [
    { key: 'directory', label: 'Directory & Leave', icon: 'ph-users-three' },
    { key: 'attendance', label: 'Attendance', icon: 'ph-fingerprint' },
    { key: 'onboarding', label: 'Onboarding', icon: 'ph-user-plus' },
    { key: 'exit', label: 'Exit', icon: 'ph-user-minus' },
    { key: 'salary', label: 'Salary Structure', icon: 'ph-currency-circle-dollar' },
    { key: 'payroll', label: 'Payroll & Compliance', icon: 'ph-lock-key' },
    { key: 'letters', label: 'Letters', icon: 'ph-envelope' },
    { key: 'orgchart', label: 'Org Chart', icon: 'ph-sitemap' },
    { key: 'loans', label: 'Loans', icon: 'ph-hand-coins' },
    { key: 'grievance', label: 'Grievance', icon: 'ph-shield-warning' },
  ];

  submitting = false;
  errorMsg = '';

  showNewStaff = false;
  staffSearch = '';
  profileStaff: any = null;
  showNewOnboarding = false;
  showNewExit = false;
  showNewLetter = false;
  showNewLoan = false;
  showNewGrievance = false;
  printingLetter: any = null;

  leaveForm = { staff_id: '', leave_type: LEAVE_TYPES[0], start_date: '', end_date: '' };
  staffForm = { full_name: '', title: '', role: '', department: '', phone: '', email: '', employment_type: EMPLOYMENT_TYPES[0], date_of_joining: '', reporting_manager_id: '', monthly_salary: '' };
  onboardForm = { name: '', position: '', dept: '', join_date: '', employment_type: EMPLOYMENT_TYPES[0], monthly_rate: '' };
  exitForm = { staff_id: '', notice_date: '', last_day: '', reason: '' };
  letterForm = { staff_id: '', letter_type: LETTER_TYPES[0], details: '' };
  loanForm = { staff_id: '', loan_type: LOAN_TYPES[0], reason: '', amount: '', tenure_months: '1' };
  grievanceForm = { staff_id: '', category: GRIEVANCE_CATEGORIES[0], description: '' };

  staff: RealtimeTableHandle<any>;
  leaves: RealtimeTableHandle<any>;
  onboarding: RealtimeTableHandle<any>;
  exits: RealtimeTableHandle<any>;
  salaryStructures: RealtimeTableHandle<any>;
  letters: RealtimeTableHandle<any>;
  loans: RealtimeTableHandle<any>;
  grievances: RealtimeTableHandle<any>;
  attendance: RealtimeTableHandle<any>;
  statutoryRegistrations: RealtimeTableHandle<any>;
  payrollRuns: RealtimeTableHandle<any>;
  complianceFilings: RealtimeTableHandle<any>;
  salaryHistory: RealtimeTableHandle<any>;

  attendanceStaffId = '';
  capturingMode: 'in' | 'out' | null = null;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.staff = this.realtime.watch('staff_directory', (q) => q.order('full_name'));
    this.leaves = this.realtime.watch('leave_requests', (q) => q.order('created_at', { ascending: false }));
    this.onboarding = this.realtime.watch('hr_onboarding', (q) => q.order('created_at', { ascending: false }));
    this.exits = this.realtime.watch('hr_exits', (q) => q.order('created_at', { ascending: false }));
    this.attendance = this.realtime.watch('hr_attendance', (q) => q.order('attendance_date', { ascending: false }));
    this.statutoryRegistrations = this.realtime.watch('hr_statutory_registrations');
    this.payrollRuns = this.realtime.watch('hr_payroll_runs', (q) => q.order('period', { ascending: false }));
    this.complianceFilings = this.realtime.watch('hr_compliance_filings', (q) => q.order('due_date'));
    this.salaryHistory = this.realtime.watch('hr_salary_history', (q) => q.order('changed_at', { ascending: false }));
    this.salaryStructures = this.realtime.watch('hr_salary_structure', (q) => q.order('employment_type'));
    this.letters = this.realtime.watch('hr_letters', (q) => q.order('created_at', { ascending: false }));
    this.loans = this.realtime.watch('hr_loans', (q) => q.order('created_at', { ascending: false }));
    this.grievances = this.realtime.watch('hr_grievances', (q) => q.order('created_at', { ascending: false }));
  }

  staffName(staffId: string) {
    return this.staff.data().find((s: any) => s.id === staffId)?.full_name ?? 'Unknown';
  }

  // Matches the reference's Staff Roster KPI concept, adapted to real data
  // we track (no shift/on-duty concept in this schema).
  kpis(): KpiItem[] {
    const staffAll = this.staff.data();
    const leaveAll = this.leaves.data();
    const today = new Date().toISOString().slice(0, 10);
    const onLeaveToday = leaveAll.filter((l: any) => l.status === 'Approved' && l.start_date <= today && l.end_date >= today);
    const pending = leaveAll.filter((l: any) => l.status === 'Pending');
    const departments = new Set(staffAll.map((s: any) => s.department)).size;
    return [
      { label: 'Total Staff', value: String(staffAll.length), icon: 'ph-identification-badge', tintKey: 'blue' },
      { label: 'On Leave Today', value: String(onLeaveToday.length), icon: 'ph-airplane-takeoff', tintKey: 'amber' },
      { label: 'Pending Leave Requests', value: String(pending.length), icon: 'ph-clock-countdown', tintKey: 'red' },
      { label: 'Departments', value: String(departments), icon: 'ph-users-three', tintKey: 'teal' },
    ];
  }

  // ---------- Leave ----------
  // Real balance, computed from actual Approved (+ Pending, counted
  // provisionally) leave requests this calendar year for the selected
  // staff member and leave type -- not a static display, an actual running
  // total against the statutory entitlement.
  leaveBalance(): { text: string; overLimit: boolean } {
    let entitlement = LEAVE_ENTITLEMENTS[this.leaveForm.leave_type];
    if (entitlement == null) return { text: 'No statutory cap for this leave type.', overLimit: false };

    // Earned Leave accrues from actual attendance under the Factories Act
    // 1948 (1 day EL per 20 days present) -- once real attendance data
    // exists for this staff member, use the real accrual instead of the
    // static annual grant, which is only a fallback for staff not yet
    // tracked via Attendance.
    let accrualNote = '';
    if (this.leaveForm.leave_type === 'Earned' && this.leaveForm.staff_id) {
      const presentDays = this.presentDaysThisYear(this.leaveForm.staff_id);
      if (presentDays > 0) {
        entitlement = Math.floor(presentDays / 20);
        accrualNote = ` (accrued from ${presentDays} present days on record, not the flat annual grant)`;
      }
    }

    const yearStart = new Date().getFullYear() + '-01-01';
    const usedDays = this.leaves.data()
      .filter((l: any) =>
        l.staff_id === this.leaveForm.staff_id &&
        l.leave_type === this.leaveForm.leave_type &&
        l.status !== 'Rejected' &&
        (l.start_date ?? '') >= yearStart
      )
      .reduce((sum: number, l: any) => {
        const days = Math.round((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / 86400000) + 1;
        return sum + Math.max(0, days);
      }, 0);

    const overLimit = usedDays >= entitlement;
    return {
      text: `Used ${usedDays} of ${entitlement} days this year (${this.leaveForm.leave_type})${accrualNote}.`,
      overLimit,
    };
  }

  async createLeave() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('leave_requests').insert({
        staff_id: this.leaveForm.staff_id, leave_type: this.leaveForm.leave_type,
        start_date: this.leaveForm.start_date, end_date: this.leaveForm.end_date, status: 'Pending',
      });
      if (error) throw error;
      this.leaveForm = { staff_id: '', leave_type: LEAVE_TYPES[0], start_date: '', end_date: '' };
      await this.leaves.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async setLeaveStatus(leave: any, status: string) {
    await this.supabaseService.client.from('leave_requests').update({ status }).eq('id', leave.id);
  }

  // ---------- Staff ----------
  // Live preview for the New Staff modal -- same computation the real
  // Individual Employee Salary table uses, just run against the form's
  // current (unsaved) values so HR sees the outcome before committing.
  newStaffPayPreview(): { label: string; value: number; bold?: boolean }[] {
    const ctc = Number(this.staffForm.monthly_salary) || 0;
    const structure = this.salaryStructures.data().find((r: any) => r.employment_type === this.staffForm.employment_type);
    if (!structure) {
      return [{ label: 'No Salary Structure policy found for this employment type -- set one up in Salary Structure first.', value: 0 }];
    }
    const basic = Math.round(ctc * (Number(structure.basic_pct) / 100));
    const hra = Math.round(basic * (Number(structure.hra_pct) / 100));
    const npa = Math.round(basic * (Number(structure.npa_pct ?? 0) / 100));
    const conveyance = Number(structure.conveyance) || 0;
    const specialAllowance = Math.max(0, ctc - basic - hra - npa - conveyance);
    const d = computeStatutoryDeductions(ctc, structure, null); // gender not yet captured at creation time
    const totalDeductions = d.employeePF + d.employeeESI + d.professionalTax;

    const lines: { label: string; value: number; bold?: boolean }[] = [
      { label: 'Basic', value: basic },
      { label: 'HRA', value: hra },
    ];
    if (npa > 0) lines.push({ label: 'NPA', value: npa });
    lines.push({ label: 'Conveyance', value: conveyance });
    lines.push({ label: 'Special Allowance', value: specialAllowance });
    lines.push({ label: 'Gross (CTC)', value: ctc, bold: true });
    if (d.employeePF > 0) lines.push({ label: 'Employee PF', value: -d.employeePF });
    if (d.employeeESI > 0) lines.push({ label: 'Employee ESI', value: -d.employeeESI });
    if (d.professionalTax > 0) lines.push({ label: 'Professional Tax (assumes Male -- set gender after creation for accuracy)', value: -d.professionalTax });
    lines.push({ label: 'Estimated Net Pay', value: ctc - totalDeductions, bold: true });
    return lines;
  }

  filteredStaff() {
    const q = this.staffSearch.trim().toLowerCase();
    if (!q) return this.staff.data();
    return this.staff.data().filter((s: any) =>
      (s.full_name ?? '').toLowerCase().includes(q) ||
      (s.title ?? '').toLowerCase().includes(q) ||
      (s.department ?? '').toLowerCase().includes(q) ||
      (s.employee_id ?? '').toLowerCase().includes(q)
    );
  }

  openProfile(s: any) {
    this.profileStaff = s;
  }

  closeProfile() {
    this.profileStaff = null;
  }

  // ================= EMPLOYEE 360 PROFILE =================
  // Consolidates what was previously scattered across 6+ separate tabs --
  // personal/employment info, pay breakdown, this month's attendance,
  // leave balances, active loans, and credential status all in one place.
  profileAttendanceThisMonth(staffId: string): { present: number; totalDays: number } {
    const period = this.currentPeriod();
    const present = this.attendance.data().filter((a: any) => a.staff_id === staffId && (a.attendance_date ?? '').startsWith(period)).length;
    const now = new Date();
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return { present, totalDays };
  }

  profileLeaveBalances(staffId: string): { type: string; used: number; entitlement: number | null }[] {
    const yearStart = new Date().getFullYear() + '-01-01';
    return LEAVE_TYPES.map((type) => {
      let entitlement = LEAVE_ENTITLEMENTS[type];
      if (type === 'Earned') {
        const presentDays = this.presentDaysThisYear(staffId);
        if (presentDays > 0) entitlement = Math.floor(presentDays / 20);
      }
      const used = this.leaves.data()
        .filter((l: any) => l.staff_id === staffId && l.leave_type === type && l.status !== 'Rejected' && (l.start_date ?? '') >= yearStart)
        .reduce((sum: number, l: any) => sum + Math.max(0, Math.round((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / 86400000) + 1), 0);
      return { type, used, entitlement };
    });
  }

  profileActiveLoans(staffId: string) {
    return this.loans.data().filter((l: any) => l.staff_id === staffId && l.stage !== 'Closed');
  }

  profileCredential(staffId: string): any {
    return this.onboarding.data().find((o: any) => o.staff_id === staffId && o.credential_expiry) ?? null;
  }

  maskAccount(acct: string | null): string {
    if (!acct) return '—';
    return acct.length > 4 ? '••••' + acct.slice(-4) : acct;
  }

  async createStaff() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('staff_directory').insert({
        full_name: this.staffForm.full_name, title: this.staffForm.title, role: this.staffForm.role,
        department: this.staffForm.department, phone: this.staffForm.phone, email: this.staffForm.email,
        employment_type: this.staffForm.employment_type, date_of_joining: this.staffForm.date_of_joining || null,
        reporting_manager_id: this.staffForm.reporting_manager_id || null,
        monthly_salary: this.staffForm.monthly_salary ? Number(this.staffForm.monthly_salary) : null,
        employee_id: 'EMP-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
      });
      if (error) throw error;
      this.showNewStaff = false;
      this.staffForm = { full_name: '', title: '', role: '', department: '', phone: '', email: '', employment_type: EMPLOYMENT_TYPES[0], date_of_joining: '', reporting_manager_id: '', monthly_salary: '' };
      await this.staff.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  // ---------- Onboarding ----------
  onboardingProgress(o: any): number {
    const total = (o.doc_checklist?.length ?? 0) + 3;
    const done = (o.doc_checklist ?? []).filter((d: any) => d.done).length + (o.it_access ? 1 : 0) + (o.id_card_issued ? 1 : 0) + (o.induction_done ? 1 : 0);
    return total ? Math.round((done / total) * 100) : 0;
  }

  onboardingNextStage(stage: string) {
    const flow: Record<string, string> = { Documents: 'IT & Access', 'IT & Access': 'Induction', Induction: 'Completed' };
    return flow[stage];
  }

  async createOnboarding() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('hr_onboarding').insert({
        name: this.onboardForm.name, position: this.onboardForm.position, dept: this.onboardForm.dept,
        join_date: this.onboardForm.join_date, employment_type: this.onboardForm.employment_type,
        monthly_rate: Number(this.onboardForm.monthly_rate), stage: 'Documents',
        doc_checklist: onboardingDocsFor(this.onboardForm.employment_type).map((label) => ({ label, done: false })),
      });
      if (error) throw error;
      this.showNewOnboarding = false;
      this.onboardForm = { name: '', position: '', dept: '', join_date: '', employment_type: EMPLOYMENT_TYPES[0], monthly_rate: '' };
      await this.onboarding.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async toggleDoc(o: any, index: number) {
    const updated = o.doc_checklist.map((d: any, i: number) => (i === index ? { ...d, done: !d.done } : d));
    await this.supabaseService.client.from('hr_onboarding').update({ doc_checklist: updated }).eq('id', o.id);
  }

  async updateCredentialExpiry(o: any, value: string) {
    await this.supabaseService.client.from('hr_onboarding').update({ credential_expiry: value || null }).eq('id', o.id);
  }

  credentialAlert(expiryDate: string | null): { text: string; bg: string; fg: string } | null {
    if (!expiryDate) return null;
    const daysLeft = Math.round((new Date(expiryDate).getTime() - Date.now()) / 86400000);
    if (daysLeft < 0) return { text: `Expired ${Math.abs(daysLeft)}d ago`, bg: '#fbe3e3', fg: '#b42318' };
    if (daysLeft <= 60) return { text: `Renewal due in ${daysLeft}d`, bg: '#fdf0d8', fg: '#946200' };
    return { text: 'Valid', bg: '#dff1ef', fg: '#0b7d72' };
  }

  async toggleFlag(o: any, field: 'it_access' | 'id_card_issued' | 'induction_done') {
    await this.supabaseService.client.from('hr_onboarding').update({ [field]: !o[field] }).eq('id', o.id);
  }

  async advanceOnboarding(o: any) {
    const next = this.onboardingNextStage(o.stage);
    if (!next) return;
    await this.supabaseService.client.from('hr_onboarding').update({ stage: next }).eq('id', o.id);
  }

  async convertToStaff(o: any) {
    const { error } = await this.supabaseService.client.from('staff_directory').insert({
      full_name: o.name, title: o.position, role: o.position, department: o.dept,
      employment_type: o.employment_type, date_of_joining: o.join_date, monthly_salary: o.monthly_rate,
      employee_id: 'EMP-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
    });
    if (error) {
      alert(error.message);
      return;
    }
    await this.staff.refresh();
    alert(`${o.name} added to Staff Directory.`);
  }

  // ---------- Exit ----------
  // Full & Final settlement must reach the employee within 2 WORKING days
  // of their last working day -- skips weekends rather than just adding
  // 2 calendar days.
  ffDeadline(e: any): { date: string; label: string; overdue: boolean } {
    let d = new Date(e.last_day);
    let added = 0;
    while (added < 2) {
      d = new Date(d.getTime() + 86400000);
      if (d.getDay() !== 0 && d.getDay() !== 6) added++;
    }
    const now = new Date();
    const daysLeft = Math.round((d.getTime() - now.getTime()) / 86400000);
    const overdue = daysLeft < 0 && e.stage !== 'Completed';
    const label = e.stage === 'Completed' ? 'settled' : overdue ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`;
    return { date: d.toLocaleDateString(), label, overdue };
  }

  exitNextStage(stage: string) {
    const flow: Record<string, string> = { Clearance: 'Settlement', Settlement: 'Exit Interview', 'Exit Interview': 'Completed' };
    return flow[stage];
  }

  onExitStaffChange() {
    // no-op hook, kept for future prefill logic
  }

  async createExit() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const staffMember = this.staff.data().find((s: any) => s.id === this.exitForm.staff_id);
      const { error } = await this.supabaseService.client.from('hr_exits').insert({
        staff_id: this.exitForm.staff_id, name: staffMember?.full_name, employee_id: staffMember?.employee_id,
        position: staffMember?.title, dept: staffMember?.department, employment_type: staffMember?.employment_type,
        notice_date: this.exitForm.notice_date, last_day: this.exitForm.last_day, reason: this.exitForm.reason, stage: 'Clearance',
        clearance_checklist: DEFAULT_EXIT_CLEARANCE.map((label) => ({ label, done: false })),
      });
      if (error) throw error;
      this.showNewExit = false;
      this.exitForm = { staff_id: '', notice_date: '', last_day: '', reason: '' };
      await this.exits.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async toggleClearance(e: any, index: number) {
    const updated = e.clearance_checklist.map((c: any, i: number) => (i === index ? { ...c, done: !c.done } : c));
    await this.supabaseService.client.from('hr_exits').update({ clearance_checklist: updated }).eq('id', e.id);
  }

  async openSettlement(e: any) {
    const staffMember = this.staff.data().find((s: any) => s.id === e.staff_id);
    const monthlySalary = Number(staffMember?.monthly_salary) || 0;
    const salaryStructure = this.salaryStructures.data().find((r: any) => r.employment_type === e.employment_type);

    // Notice period pay: real calculation from actual notice_date -> last_day gap.
    const noticeDays = e.notice_date && e.last_day
      ? Math.max(0, Math.round((new Date(e.last_day).getTime() - new Date(e.notice_date).getTime()) / 86400000))
      : 0;
    const noticePay = Math.round((monthlySalary / 30) * noticeDays);

    // Gratuity eligibility threshold differs by employment type since the
    // Industrial Relations Code 2020 took effect (21 Nov 2025): Fixed-Term/
    // Contract employees now get PRO-RATA gratuity after just 1 year of
    // service -- a genuine, recent change from the traditional 5-year
    // threshold under the Payment of Gratuity Act 1972, which still applies
    // to Permanent/Medical Officer staff. Getting this wrong for contract
    // staff would have meant under-paying a real statutory entitlement.
    const yearsOfService = staffMember?.date_of_joining && e.last_day
      ? (new Date(e.last_day).getTime() - new Date(staffMember.date_of_joining).getTime()) / (365.25 * 86400000)
      : 0;
    const isFixedTerm = e.employment_type === 'Contract';
    const gratuityThresholdYears = isFixedTerm ? 1 : 5;
    const gratuityEligible = !!salaryStructure?.gratuity_applicable && yearsOfService >= gratuityThresholdYears;
    // Fixed-term gratuity is explicitly pro-rata (proportional to actual
    // service), whereas the traditional 5-year-plus calculation uses the
    // full 15/26 x salary x years formula unprorated.
    const gratuity = gratuityEligible
      ? Math.round((15 / 26) * monthlySalary * yearsOfService)
      : 0;

    const settlement = [
      { label: `Notice period pay (${noticeDays}d)`, value: noticePay },
      { label: 'Leave encashment (enter manually -- not tracked)', value: 0 },
      {
        label: gratuityEligible
          ? `Gratuity (${yearsOfService.toFixed(1)}y service${isFixedTerm ? ', pro-rata per IR Code 2020' : ', 15/26 x salary x years'})`
          : `Gratuity (not eligible -- ${yearsOfService.toFixed(1)}y service, needs ${gratuityThresholdYears}y+)`,
        value: gratuity,
      },
      { label: 'Deductions (enter manually)', value: 0 },
    ];
    await this.supabaseService.client.from('hr_exits').update({ settlement }).eq('id', e.id);
    await this.exits.refresh();
  }

  async advanceExit(e: any) {
    const next = this.exitNextStage(e.stage);
    if (!next) return;
    const patch: any = { stage: next };
    if (next === 'Completed') patch.relieving_issued = true;
    await this.supabaseService.client.from('hr_exits').update(patch).eq('id', e.id);
    if (next === 'Completed') {
      await this.supabaseService.client.from('staff_directory').update({ status: 'Inactive' }).eq('id', e.staff_id);
      await this.staff.refresh();
    }
  }

  // ---------- Salary Structure ----------
  // Visual identity per employment type, matching the app's existing tint
  // palette for consistency with KPI cards elsewhere.
  employmentTypeTint(type: string): { bg: string; fg: string } {
    const map: Record<string, { bg: string; fg: string }> = {
      Permanent: { bg: '#e4edfb', fg: '#2257a3' },
      'Medical Officer': { bg: '#ece8fb', fg: '#5536c9' },
      Contract: { bg: '#fdf0d8', fg: '#946200' },
      Consultant: { bg: '#fbe3e3', fg: '#b42318' },
      Intern: { bg: '#dff1ef', fg: '#0b7d72' },
    };
    return map[type] ?? { bg: '#eef2f6', fg: '#5f7689' };
  }

  employmentTypeIcon(type: string): string {
    const map: Record<string, string> = {
      Permanent: 'ph-identification-badge',
      'Medical Officer': 'ph-stethoscope',
      Contract: 'ph-file-text',
      Consultant: 'ph-briefcase',
      Intern: 'ph-graduation-cap',
    };
    return map[type] ?? 'ph-user';
  }

  async updateRegistrationField(field: string, value: string) {
    const reg = this.statutoryRegistrations.data()[0];
    if (!reg) return;
    const { error } = await this.supabaseService.client
      .from('hr_statutory_registrations')
      .update({ [field]: value || null, updated_at: new Date().toISOString() })
      .eq('id', reg.id);
    if (error) alert(error.message);
    await this.statutoryRegistrations.refresh();
  }

  registrationCompleteness(): { filled: number; total: number; pct: number } {
    const reg = this.statutoryRegistrations.data()[0];
    const fields = ['pf_establishment_code', 'esi_employer_code', 'pt_ptec_number', 'pt_ptrc_number', 'tan_number'];
    const filled = reg ? fields.filter((f) => !!reg[f]).length : 0;
    return { filled, total: fields.length, pct: Math.round((filled / fields.length) * 100) };
  }

  // ================= PAYROLL CYCLE (Run -> Validate -> Lock) =================
  currentPeriod(): string {
    return new Date().toISOString().slice(0, 7);
  }

  currentPayrollRun(): any {
    return this.payrollRuns.data().find((r: any) => r.period === this.currentPeriod()) ?? null;
  }

  isPayrollLocked(): boolean {
    return this.currentPayrollRun()?.status === 'Locked';
  }

  async runPayroll() {
    const period = this.currentPeriod();
    const staffWithSalary = this.staff.data().filter((s: any) => s.monthly_salary != null);
    let totalNet = 0;
    for (const s of staffWithSalary) totalNet += this.netPayFor(s);

    const existing = this.currentPayrollRun();
    const client = this.supabaseService.client;
    if (existing) {
      await client.from('hr_payroll_runs').update({ staff_count: staffWithSalary.length, total_net_pay: totalNet, status: 'Draft' }).eq('id', existing.id);
    } else {
      await client.from('hr_payroll_runs').insert({ period, status: 'Draft', staff_count: staffWithSalary.length, total_net_pay: totalNet });
    }
    await this.payrollRuns.refresh();
  }

  async validatePayroll() {
    const run = this.currentPayrollRun();
    if (!run) return;
    await this.supabaseService.client.from('hr_payroll_runs').update({ status: 'Validated', validated_at: new Date().toISOString() }).eq('id', run.id);
    await this.payrollRuns.refresh();
  }

  async lockPayroll() {
    const run = this.currentPayrollRun();
    if (!run) return;
    if (!confirm('Lock payroll for this period? Salary edits will be blocked until the next monthly cycle.')) return;
    await this.supabaseService.client.from('hr_payroll_runs').update({ status: 'Locked', locked_at: new Date().toISOString() }).eq('id', run.id);
    await this.payrollRuns.refresh();
  }

  // A one-way lock with no correction path is a real design flaw, not a
  // safety feature -- genuine data-entry errors happen after locking, and
  // real payroll software always provides an audit-logged unlock route.
  // Returns to 'Validated' (not all the way back to 'Draft'), preserving
  // the prior validation, and requires a reason -- forcing a deliberate,
  // traceable action rather than a silent bypass.
  async unlockPayroll() {
    const run = this.currentPayrollRun();
    if (!run) return;
    const reason = prompt('Reason for unlocking this payroll period (required, will be logged):');
    if (!reason || !reason.trim()) {
      if (reason !== null) alert('A reason is required to unlock payroll.');
      return;
    }
    await this.supabaseService.client.from('hr_payroll_runs').update({
      status: 'Validated', unlock_reason: reason, unlocked_at: new Date().toISOString(),
    }).eq('id', run.id);
    await this.payrollRuns.refresh();
  }

  // ================= ANOMALY DETECTION =================
  // Real checks against real data -- not the reference's fictional
  // example employees. Each mirrors a documented real pattern: unexplained
  // salary jumps, duplicate bank accounts, missing attendance, and
  // new-joiner outliers.
  computeAnomalies(): { severity: 'HIGH' | 'MED' | 'LOW'; cat: 'danger' | 'warn' | 'info'; title: string; detail: string }[] {
    const anomalies: { severity: 'HIGH' | 'MED' | 'LOW'; cat: 'danger' | 'warn' | 'info'; title: string; detail: string }[] = [];
    const staffList = this.staff.data();

    // 1. Salary spike >20% vs the most recent recorded change
    for (const s of staffList) {
      const latest = this.salaryHistory.data().find((h: any) => h.staff_id === s.id);
      if (latest && Number(latest.old_salary) > 0) {
        const pctChange = ((Number(latest.new_salary) - Number(latest.old_salary)) / Number(latest.old_salary)) * 100;
        if (pctChange > 20) {
          anomalies.push({
            severity: 'HIGH', cat: 'danger',
            title: 'Salary spike without increment record',
            detail: `${s.full_name} (₹${Number(latest.old_salary).toLocaleString('en-IN')} → ₹${Number(latest.new_salary).toLocaleString('en-IN')}, +${pctChange.toFixed(0)}%) -- no approved increment record tracked for this change.`,
          });
        }
      }
    }

    // 2. Duplicate bank account across active staff
    const acctMap = new Map<string, string[]>();
    for (const s of staffList) {
      if (s.bank_account_number) {
        const list = acctMap.get(s.bank_account_number) ?? [];
        list.push(s.full_name);
        acctMap.set(s.bank_account_number, list);
      }
    }
    for (const [acct, names] of acctMap) {
      if (names.length > 1) {
        anomalies.push({
          severity: 'HIGH', cat: 'danger',
          title: 'Duplicate bank account',
          detail: `${names.join(' / ')} are mapped to the same account no. ••••${acct.slice(-4)} -- possible data-entry error.`,
        });
      }
    }

    // 3. Zero present days this month, no leave marked
    const monthStart = this.currentPeriod();
    for (const s of staffList) {
      if (s.monthly_salary == null) continue;
      const presentThisMonth = this.attendance.data().filter((a: any) => a.staff_id === s.id && (a.attendance_date ?? '').startsWith(monthStart)).length;
      const leaveThisMonth = this.leaves.data().filter((l: any) => l.staff_id === s.id && l.status !== 'Rejected' && (l.start_date ?? '').startsWith(monthStart)).length;
      if (presentThisMonth === 0 && leaveThisMonth === 0) {
        anomalies.push({
          severity: 'MED', cat: 'warn',
          title: 'Zero present days, no leave',
          detail: `${s.full_name} shows 0 days present this month with no leave marked -- likely missing attendance data.`,
        });
      }
    }

    // 4. New joiner (within 60 days) salary >30% above peer average for their type
    const now = Date.now();
    for (const s of staffList) {
      if (!s.date_of_joining || s.monthly_salary == null) continue;
      const daysSinceJoining = (now - new Date(s.date_of_joining).getTime()) / 86400000;
      if (daysSinceJoining > 60) continue;
      const peers = staffList.filter((p: any) => p.employment_type === s.employment_type && p.monthly_salary != null && p.id !== s.id);
      if (peers.length === 0) continue;
      const avg = peers.reduce((sum: number, p: any) => sum + Number(p.monthly_salary), 0) / peers.length;
      if (avg <= 0) continue;
      const pctAbove = ((Number(s.monthly_salary) - avg) / avg) * 100;
      if (pctAbove > 30) {
        anomalies.push({
          severity: 'LOW', cat: 'info',
          title: 'New joiner above peer average',
          detail: `${s.full_name} (joined ${Math.round(daysSinceJoining)}d ago) is ${pctAbove.toFixed(0)}% above the average salary for ${s.employment_type}.`,
        });
      }
    }

    return anomalies;
  }

  // ================= COMPLIANCE CALENDAR =================
  // Real statutory deadlines for the current period -- PF ECR/ESIC/PT all
  // due the 15th, TDS deposit due the 7th of the FOLLOWING month (matches
  // the actual TDS deposit rule researched earlier).
  complianceCalendar(): { filing_type: string; period: string; due_date: string; status: string; existing: any }[] {
    const now = new Date();
    const period = this.currentPeriod();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextPeriod = nextMonth.toISOString().slice(0, 7);

    const deadlines = [
      { filing_type: 'PF ECR Challan', due_date: `${period}-15`, period },
      { filing_type: 'ESIC Challan', due_date: `${period}-15`, period },
      { filing_type: 'PT Return', due_date: `${period}-15`, period },
      { filing_type: 'TDS Deposit', due_date: `${nextPeriod}-07`, period },
    ];

    return deadlines.map((d) => {
      const existing = this.complianceFilings.data().find((f: any) => f.period === d.period && f.filing_type === d.filing_type);
      const isOverdue = new Date(d.due_date) < now && existing?.status !== 'Filed';
      const status = existing?.status === 'Filed' ? 'Filed' : isOverdue ? 'Overdue' : 'Pending';
      return { ...d, status, existing };
    });
  }

  async markFiled(item: any) {
    const client = this.supabaseService.client;
    if (item.existing) {
      await client.from('hr_compliance_filings').update({ status: 'Filed', filed_at: new Date().toISOString() }).eq('id', item.existing.id);
    } else {
      await client.from('hr_compliance_filings').insert({
        period: item.period, filing_type: item.filing_type, due_date: item.due_date, status: 'Filed', filed_at: new Date().toISOString(),
      });
    }
    await this.complianceFilings.refresh();
  }

  async updateStaffField(s: any, field: string, value: string) {
    const { error } = await this.supabaseService.client.from('staff_directory').update({ [field]: value || null }).eq('id', s.id);
    if (error) alert(error.message);
    await this.staff.refresh();
  }

  // Real Net Pay for a specific employee, using their actual salary,
  // employment type's structure, and their own gender (for accurate PT).
  netPayFor(s: any): number {
    const structure = this.salaryStructures.data().find((r: any) => r.employment_type === s.employment_type);
    if (!structure || s.monthly_salary == null) return 0;
    const d = computeStatutoryDeductions(Number(s.monthly_salary), structure, s.gender);
    return Number(s.monthly_salary) - d.employeePF - d.employeeESI - d.professionalTax;
  }

  printingPayslip: any = null;
  printingPayslipLines: { label: string; value: number }[] = [];

  printPayslip(s: any) {
    const structure = this.salaryStructures.data().find((r: any) => r.employment_type === s.employment_type);
    if (!structure) return;
    const ctc = Number(s.monthly_salary);
    const basic = Math.round(ctc * (Number(structure.basic_pct) / 100));
    const hra = Math.round(basic * (Number(structure.hra_pct) / 100));
    const npa = Math.round(basic * (Number(structure.npa_pct ?? 0) / 100));
    const conveyance = Number(structure.conveyance) || 0;
    const specialAllowance = Math.max(0, ctc - basic - hra - npa - conveyance);
    const d = computeStatutoryDeductions(ctc, structure, s.gender);

    const lines: { label: string; value: number }[] = [
      { label: 'Basic', value: basic },
      { label: 'HRA', value: hra },
    ];
    if (npa > 0) lines.push({ label: 'NPA', value: npa });
    lines.push({ label: 'Conveyance', value: conveyance });
    lines.push({ label: 'Special Allowance', value: specialAllowance });
    lines.push({ label: 'Gross Pay', value: ctc });
    if (d.employeePF > 0) lines.push({ label: 'Employee PF', value: -d.employeePF });
    if (d.employeeESI > 0) lines.push({ label: 'Employee ESI', value: -d.employeeESI });
    if (d.professionalTax > 0) lines.push({ label: 'Professional Tax', value: -d.professionalTax });
    lines.push({ label: 'Net Take-Home Pay', value: this.netPayFor(s) });

    this.printingPayslip = s;
    this.printingPayslipLines = lines;
    setTimeout(() => {
      window.print();
      this.printingPayslip = null;
    }, 50);
  }

  async updateStaffSalary(s: any, value: string) {
    if (this.isPayrollLocked()) {
      alert(`Payroll for ${this.currentPeriod()} is locked. Salary edits are blocked until next month's cycle begins.`);
      return;
    }
    const salary = value === '' || value == null ? null : Number(value);
    const client = this.supabaseService.client;

    // Log the change for anomaly detection -- only when there was a prior
    // real value (not the initial salary-setting for a new hire, which
    // isn't a "change" worth flagging).
    if (s.monthly_salary != null && salary != null && salary !== Number(s.monthly_salary)) {
      await client.from('hr_salary_history').insert({ staff_id: s.id, old_salary: s.monthly_salary, new_salary: salary });
    }

    const { error } = await client.from('staff_directory').update({ monthly_salary: salary }).eq('id', s.id);
    if (error) alert(error.message);
    await this.staff.refresh();
  }

  staffCountFor(employmentType: string): number {
    return this.staff.data().filter((s: any) => s.employment_type === employmentType).length;
  }

  // Real average salary for staff on record in this type where available,
  // otherwise a reasonable illustrative default so the payslip breakdown
  // always shows something concrete rather than an empty state.
  illustrativeCtc(employmentType: string): number {
    const withSalary = this.staffWithSalaryFor(employmentType);
    if (withSalary.length > 0) {
      return Math.round(withSalary.reduce((sum: number, s: any) => sum + Number(s.monthly_salary), 0) / withSalary.length);
    }
    const defaults: Record<string, number> = {
      Permanent: 30000, 'Medical Officer': 120000, Contract: 22000, Consultant: 80000, Intern: 12000,
    };
    return defaults[employmentType] ?? 25000;
  }

  // A real payslip-style breakdown -- Basic/HRA/NPA/Conveyance/Special
  // Allowance (the balancing figure) building up to Gross, using this
  // row's actual pay-component percentages against a representative CTC.
  payslipLines(r: any): { label: string; value: number; bold?: boolean; section?: boolean }[] {
    const ctc = this.illustrativeCtc(r.employment_type);
    const basic = Math.round(ctc * (Number(r.basic_pct) / 100));
    const hra = Math.round(basic * (Number(r.hra_pct) / 100));
    const npa = Math.round(basic * (Number(r.npa_pct ?? 0) / 100));
    const conveyance = Number(r.conveyance) || 0;
    const specialAllowance = Math.max(0, ctc - basic - hra - npa - conveyance);
    const d = computeStatutoryDeductions(ctc, r, null); // illustrative -- no specific employee's gender to check PT exemption against
    const totalDeductions = d.employeePF + d.employeeESI + d.professionalTax;
    const netPay = ctc - totalDeductions;

    const lines: { label: string; value: number; bold?: boolean; section?: boolean }[] = [
      { label: 'Basic', value: basic },
      { label: 'HRA', value: hra },
    ];
    if (npa > 0) lines.push({ label: 'NPA', value: npa });
    lines.push({ label: 'Conveyance', value: conveyance });
    lines.push({ label: 'Special Allowance (balancing)', value: specialAllowance });
    lines.push({ label: 'Gross (CTC)', value: ctc, bold: true });
    lines.push({ label: 'Deductions', value: 0, section: true });
    if (d.employeePF > 0) lines.push({ label: 'Employee PF', value: -d.employeePF });
    if (d.employeeESI > 0) lines.push({ label: 'Employee ESI', value: -d.employeeESI });
    if (d.professionalTax > 0) lines.push({ label: 'Professional Tax', value: -d.professionalTax });
    if (totalDeductions === 0) lines.push({ label: 'None applicable at this pay level', value: 0 });
    lines.push({ label: 'Net Take-Home Pay', value: netPay, bold: true });
    return lines;
  }

  openBreakdowns = new Set<string>();

  toggleBreakdown(employmentType: string) {
    if (this.openBreakdowns.has(employmentType)) this.openBreakdowns.delete(employmentType);
    else this.openBreakdowns.add(employmentType);
  }

  isBreakdownOpen(employmentType: string): boolean {
    return this.openBreakdowns.has(employmentType);
  }

  // Hospital-wide summary across every employment type combined -- the
  // "at a glance" figures a finance lead would actually want first.
  salaryOverviewKpis(): KpiItem[] {
    const allWithSalary = this.staff.data().filter((s: any) => s.monthly_salary != null);
    let employerLiability = 0, employeeDeductions = 0, estTDS = 0, totalPT = 0;
    for (const s of allWithSalary) {
      const structure = this.salaryStructures.data().find((r: any) => r.employment_type === s.employment_type);
      if (!structure) continue;
      const d = computeStatutoryDeductions(Number(s.monthly_salary), structure, s.gender);
      employerLiability += d.employerEPS + d.employerEPF + d.employerEDLI + d.employerESI;
      employeeDeductions += d.employeePF + d.employeeESI;
      totalPT += d.professionalTax;
      estTDS += estimateMonthlyTDS(Number(s.monthly_salary) * 12);
    }
    const missingSalary = this.staff.data().filter((s: any) => s.monthly_salary == null).length;
    return [
      { label: 'Staff with Salary Data', value: String(allWithSalary.length), icon: 'ph-identification-badge', tintKey: 'blue' },
      { label: 'Missing Salary Setup', value: String(missingSalary), icon: 'ph-warning', tintKey: missingSalary > 0 ? 'red' : 'green' },
      { label: 'Monthly Employer Liability', value: '\u20b9' + employerLiability.toLocaleString('en-IN'), icon: 'ph-buildings', tintKey: 'indigo' },
      { label: 'Monthly Employee Deductions (PF+ESI+PT)', value: '\u20b9' + (employeeDeductions + totalPT).toLocaleString('en-IN'), icon: 'ph-arrow-circle-down', tintKey: 'amber' },
      { label: 'Est. Monthly TDS (all staff)', value: '\u20b9' + estTDS.toLocaleString('en-IN'), icon: 'ph-receipt', tintKey: 'teal' },
    ];
  }

  staffWithSalaryFor(employmentType: string) {
    return this.staff.data().filter((s: any) => s.employment_type === employmentType && s.monthly_salary != null);
  }

  // Real aggregate across every staff member on record in this employment
  // type with a recorded salary -- each computed individually against
  // their own CTC (basic derived from this row's basic_pct), then summed.
  statutoryTotals(r: any): { employeePF: number; employerTotal: number; employeeESI: number; employerESI: number; estimatedTDS: number; totalPT: number } {
    const staffList = this.staffWithSalaryFor(r.employment_type);
    let employeePF = 0, employerTotal = 0, employeeESI = 0, employerESI = 0, estimatedTDS = 0, totalPT = 0;
    for (const s of staffList) {
      const d = computeStatutoryDeductions(Number(s.monthly_salary), r, s.gender);
      employeePF += d.employeePF;
      employerTotal += d.employerEPS + d.employerEPF + d.employerEDLI;
      employeeESI += d.employeeESI;
      employerESI += d.employerESI;
      estimatedTDS += estimateMonthlyTDS(Number(s.monthly_salary) * 12);
      totalPT += d.professionalTax;
    }
    return { employeePF, employerTotal, employeeESI, employerESI, estimatedTDS, totalPT };
  }

  async toggleStatutory(r: any, field: string) {
    await this.supabaseService.client.from('hr_salary_structure').update({ [field]: !r[field] }).eq('id', r.id);
  }

  async updateSalaryField(r: any, field: string, value: number) {
    await this.supabaseService.client.from('hr_salary_structure').update({ [field]: value }).eq('id', r.id);
  }

  // ---------- Letters ----------
  onLetterStaffChange() {
    const s = this.staff.data().find((x: any) => x.id === this.letterForm.staff_id);
    if (!s) return;
    const defaults: Record<string, string> = {
      'Offer Letter': `We are pleased to offer ${s.full_name} the position of ${s.title} in the ${s.department} department at City General Hospital.`,
      // Mandatory under the Industrial Relations Code 2020 (effective 21 Nov
      // 2025) for every worker in every sector: nature of work classification
      // and employment category are now required content, not optional detail.
      'Appointment Letter': `This confirms the appointment of ${s.full_name} as ${s.title}, ${s.department} department, effective ${s.date_of_joining || 'the agreed date'}.\n\nNature of work: ${this.natureOfWorkFor(s.title)}\nEmployment category: ${s.employment_type || 'Permanent'}${s.employment_type === 'Contract' ? ' (Fixed-Term Employment -- eligible for all statutory benefits equal to permanent employees, including pro-rata gratuity after 1 year of service)' : ''}\nMonthly salary: ${s.monthly_salary ? '\u20b9' + Number(s.monthly_salary).toLocaleString('en-IN') : '[to be specified]'}`,
      'Relieving Letter': `This is to certify that ${s.full_name} has been relieved of duties as ${s.title} in the ${s.department} department.`,
      'Experience Letter': `This is to certify that ${s.full_name} worked as ${s.title} in the ${s.department} department at City General Hospital.`,
      'Salary Certificate': `This is to certify the current compensation details of ${s.full_name}, ${s.title}, ${s.department} department.`,
    };
    this.letterForm.details = defaults[this.letterForm.letter_type] ?? '';
  }

  // Rough classification for the appointment letter's mandatory "nature of
  // work" field -- clinical/technical roles vs supervisory vs clerical,
  // per the categories the IR Code 2020 actually lists.
  natureOfWorkFor(title: string): string {
    const t = (title || '').toLowerCase();
    if (t.includes('doctor') || t.includes('consultant') || t.includes('officer')) return 'Technical / Professional';
    if (t.includes('nurse') || t.includes('technician') || t.includes('pharmacist')) return 'Technical / Skilled';
    if (t.includes('manager') || t.includes('supervisor') || t.includes('head')) return 'Supervisory / Managerial';
    if (t.includes('receptionist') || t.includes('clerk') || t.includes('accountant')) return 'Clerical';
    return 'Skilled';
  }

  async createLetter() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const s = this.staff.data().find((x: any) => x.id === this.letterForm.staff_id);
      const { error } = await this.supabaseService.client.from('hr_letters').insert({
        staff_id: this.letterForm.staff_id, name: s?.full_name, letter_type: this.letterForm.letter_type,
        details: this.letterForm.details, issued: false,
      });
      if (error) throw error;
      this.showNewLetter = false;
      this.letterForm = { staff_id: '', letter_type: LETTER_TYPES[0], details: '' };
      await this.letters.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async issueAndPrintLetter(l: any) {
    if (!l.issued) {
      await this.supabaseService.client.from('hr_letters').update({ issued: true, issued_at: new Date().toISOString() }).eq('id', l.id);
      await this.letters.refresh();
    }
    this.printingLetter = { ...l, issued_at: l.issued_at ?? new Date().toISOString() };
    setTimeout(() => {
      window.print();
      this.printingLetter = null;
    }, 50);
  }

  // ---------- Org Chart ----------
  nursingHeadcount(): number {
    return this.staff.data().filter((s: any) =>
      (s.title ?? '').toLowerCase().includes('nurse') || (s.department ?? '').toLowerCase().includes('nursing')
    ).length;
  }

  orgChartRows(): { name: string; title: string; dept: string; managerName: string | null; indent: number }[] {
    const all = this.staff.data();
    const byManager = new Map<string | null, any[]>();
    for (const s of all) {
      const key = s.reporting_manager_id ?? null;
      if (!byManager.has(key)) byManager.set(key, []);
      byManager.get(key)!.push(s);
    }
    const rows: { name: string; title: string; dept: string; managerName: string | null; indent: number }[] = [];
    const visit = (managerId: string | null, depth: number) => {
      const children = (byManager.get(managerId) ?? []).sort((a, b) => a.full_name.localeCompare(b.full_name));
      for (const child of children) {
        const manager = all.find((s: any) => s.id === child.reporting_manager_id);
        rows.push({ name: child.full_name, title: child.title, dept: child.department, managerName: manager?.full_name ?? null, indent: depth * 22 });
        visit(child.id, depth + 1);
      }
    };
    visit(null, 0);
    return rows;
  }

  // ---------- Loans ----------
  loanNextStage(stage: string) {
    const flow: Record<string, string> = { Requested: 'Approved', Approved: 'Disbursed', Disbursed: 'Recovering', Recovering: 'Closed' };
    return flow[stage];
  }

  async createLoan() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const s = this.staff.data().find((x: any) => x.id === this.loanForm.staff_id);
      const amount = Number(this.loanForm.amount);
      const tenure = Number(this.loanForm.tenure_months) || 1;
      const { error } = await this.supabaseService.client.from('hr_loans').insert({
        staff_id: this.loanForm.staff_id, name: s?.full_name, loan_type: this.loanForm.loan_type,
        reason: this.loanForm.reason, amount, tenure_months: tenure,
        emi: Math.round(amount / tenure), outstanding: amount, stage: 'Requested',
      });
      if (error) throw error;
      this.showNewLoan = false;
      this.loanForm = { staff_id: '', loan_type: LOAN_TYPES[0], reason: '', amount: '', tenure_months: '1' };
      await this.loans.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async advanceLoan(l: any) {
    const next = this.loanNextStage(l.stage);
    if (!next) return;
    await this.supabaseService.client.from('hr_loans').update({ stage: next }).eq('id', l.id);
  }

  // ---------- Grievance ----------
  // Sexual harassment complaints must go to the Internal Committee from
  // day one under Section 9 of the POSH Act -- not treated as a generic
  // HR case that gets "escalated" later. Discrimination is included as a
  // practical extension many Indian workplaces apply the same rigor to,
  // though it isn't itself a POSH Act category.
  isPoshCategory(g: any): boolean {
    return g.category === 'Harassment' || g.category === 'Discrimination';
  }

  poshDeadline(g: any, daysFromComplaint: number): { date: string; label: string; overdue: boolean } {
    const complaintDate = new Date(g.created_at);
    const deadline = new Date(complaintDate.getTime() + daysFromComplaint * 86400000);
    const now = new Date();
    const daysLeft = Math.round((deadline.getTime() - now.getTime()) / 86400000);
    const overdue = daysLeft < 0 && g.stage !== 'Resolved';
    const label = g.stage === 'Resolved' ? 'closed' : overdue ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`;
    return { date: deadline.toLocaleDateString(), label, overdue };
  }

  grievanceNextStage(stage: string) {
    const flow: Record<string, string> = { Reported: 'Under Review', 'Under Review': 'Resolved' };
    return flow[stage];
  }

  async createGrievance() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const s = this.staff.data().find((x: any) => x.id === this.grievanceForm.staff_id);
      const { error } = await this.supabaseService.client.from('hr_grievances').insert({
        staff_id: this.grievanceForm.staff_id, name: s?.full_name, category: this.grievanceForm.category,
        description: this.grievanceForm.description, stage: 'Reported',
      });
      if (error) throw error;
      this.showNewGrievance = false;
      this.grievanceForm = { staff_id: '', category: GRIEVANCE_CATEGORIES[0], description: '' };
      await this.grievances.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async advanceGrievance(g: any) {
    const next = this.grievanceNextStage(g.stage);
    if (!next) return;
    await this.supabaseService.client.from('hr_grievances').update({ stage: next }).eq('id', g.id);
  }

  async escalateGrievance(g: any) {
    await this.supabaseService.client.from('hr_grievances').update({ stage: 'Escalated', escalated_posh: true }).eq('id', g.id);
  }

  staffNameFor(staffId: string): string {
    return this.staff.data().find((s: any) => s.id === staffId)?.full_name ?? 'Unknown';
  }

  todaysAttendanceFor(staffId: string): any {
    const today = new Date().toISOString().slice(0, 10);
    return this.attendance.data().find((a: any) => a.staff_id === staffId && a.attendance_date === today) ?? null;
  }

  recentAttendance() {
    return this.attendance.data().slice(0, 50);
  }

  hoursWorked(a: any): string {
    if (!a.check_in_at || !a.check_out_at) return '—';
    const hours = (new Date(a.check_out_at).getTime() - new Date(a.check_in_at).getTime()) / 3600000;
    return hours.toFixed(1);
  }

  startCapture(mode: 'in' | 'out') {
    this.capturingMode = mode;
  }

  async onCaptured(capture: AttendanceCapture) {
    if (!this.attendanceStaffId || !this.capturingMode) return;
    const client = this.supabaseService.client;
    const today = new Date().toISOString().slice(0, 10);

    if (this.capturingMode === 'in') {
      const { error } = await client.from('hr_attendance').insert({
        staff_id: this.attendanceStaffId,
        attendance_date: today,
        check_in_at: new Date().toISOString(),
        check_in_photo: capture.photo,
        check_in_lat: capture.lat,
        check_in_lng: capture.lng,
        status: 'Present',
      });
      if (error) alert(error.message);
    } else {
      const existing = this.todaysAttendanceFor(this.attendanceStaffId);
      if (existing) {
        const { error } = await client.from('hr_attendance').update({
          check_out_at: new Date().toISOString(),
          check_out_photo: capture.photo,
        }).eq('id', existing.id);
        if (error) alert(error.message);
      }
    }
    this.capturingMode = null;
    await this.attendance.refresh();
  }

  // Real Present-day count this year, feeding the Factories Act 1948
  // Earned Leave accrual formula (1 day EL per 20 days present) -- used
  // by leaveBalance() to replace the static entitlement once attendance
  // data actually exists for this staff member.
  presentDaysThisYear(staffId: string): number {
    const yearStart = new Date().getFullYear() + '-01-01';
    return this.attendance.data().filter((a: any) =>
      a.staff_id === staffId && a.status !== 'Absent' && (a.attendance_date ?? '') >= yearStart
    ).length;
  }

  attendanceKpis(): KpiItem[] {
    const today = new Date().toISOString().slice(0, 10);
    const todayRecords = this.attendance.data().filter((a: any) => a.attendance_date === today);
    const checkedIn = todayRecords.filter((a: any) => a.check_in_at && !a.check_out_at);
    const checkedOut = todayRecords.filter((a: any) => a.check_out_at);
    const totalStaff = this.staff.data().length;
    const notMarked = Math.max(0, totalStaff - todayRecords.length);
    return [
      { label: 'Present Today', value: String(todayRecords.length), icon: 'ph-check-circle', tintKey: 'green' },
      { label: 'Currently Checked In', value: String(checkedIn.length), icon: 'ph-clock', tintKey: 'blue' },
      { label: 'Checked Out Today', value: String(checkedOut.length), icon: 'ph-sign-out', tintKey: 'teal' },
      { label: 'Not Marked Yet', value: String(notMarked), icon: 'ph-question', tintKey: 'amber' },
    ];
  }

  ngOnDestroy() {
    this.staff.dispose();
    this.leaves.dispose();
    this.onboarding.dispose();
    this.exits.dispose();
    this.salaryStructures.dispose();
    this.letters.dispose();
    this.loans.dispose();
    this.grievances.dispose();
    this.attendance.dispose();
    this.statutoryRegistrations.dispose();
    this.payrollRuns.dispose();
    this.complianceFilings.dispose();
    this.salaryHistory.dispose();
  }
}
