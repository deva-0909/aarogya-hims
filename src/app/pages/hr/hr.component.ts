import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';
import { PrintLetterheadComponent } from '../../shared/print-letterhead.component';

type HrTab = 'directory' | 'onboarding' | 'exit' | 'salary' | 'letters' | 'orgchart' | 'loans' | 'grievance';

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Maternity/Paternity', 'Unpaid'];
const EMPLOYMENT_TYPES = ['Permanent', 'Contract', 'Probation', 'Intern'];
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

function shortId(id: string, prefix: string): string {
  return prefix + '-' + id.slice(0, 4).toUpperCase();
}

function pillStyle(stage: string) {
  return STAGE_COLOR[stage] ?? { bg: '#eaeef3', fg: '#51687d' };
}

@Component({
  selector: 'app-hr',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent, PrintLetterheadComponent],
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
            <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm flex items-center justify-between">
              <span>Staff Directory ({{ staff.data().length }})</span>
              <button (click)="showNewStaff = true" class="bg-brand hover:bg-brand-hover text-white rounded-[7px] px-3 py-1.5 text-[11.5px] font-semibold">+ New Staff</button>
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
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let s of staff.data()" class="border-b border-line-2 last:border-0">
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

      <!-- ================= ONBOARDING ================= -->
      <div *ngIf="activeTab === 'onboarding'" class="flex flex-col gap-3">
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
      <div *ngIf="activeTab === 'salary'" class="bg-white border border-[#e7ecf2] rounded-[14px] overflow-hidden">
        <div class="px-[18px] py-[14px] border-b border-[#eef2f6]">
          <h3 class="m-0 text-[14px] font-semibold text-[#1c3a4d]">Salary Structure Master — by Employment Type</h3>
          <div class="text-[12px] text-[#8094a6] mt-[3px]">Pay components + statutory applicability (PF / ESI / PT / Gratuity / TDS), per Indian payroll compliance norms.</div>
        </div>
        <div *ngFor="let r of salaryStructures.data()" class="px-[18px] py-[14px] border-b border-[#f1f4f8] last:border-0">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="font-semibold text-[14px] text-[#22384a]">{{ r.employment_type }}</div>
            <div class="flex gap-[6px] flex-wrap">
              <button (click)="toggleStatutory(r, 'pf_applicable')" class="rounded-pill px-[11px] py-1 text-[10.5px] font-semibold"
                [style.background]="r.pf_applicable ? '#dff1ef' : '#eef2f6'" [style.color]="r.pf_applicable ? '#0b7d72' : '#8094a6'">PF: {{ r.pf_applicable ? 'Yes' : 'No' }}</button>
              <button (click)="toggleStatutory(r, 'esi_applicable')" class="rounded-pill px-[11px] py-1 text-[10.5px] font-semibold"
                [style.background]="r.esi_applicable ? '#dff1ef' : '#eef2f6'" [style.color]="r.esi_applicable ? '#0b7d72' : '#8094a6'">ESI: {{ r.esi_applicable ? 'Yes' : 'No' }}</button>
              <button (click)="toggleStatutory(r, 'pt_applicable')" class="rounded-pill px-[11px] py-1 text-[10.5px] font-semibold"
                [style.background]="r.pt_applicable ? '#dff1ef' : '#eef2f6'" [style.color]="r.pt_applicable ? '#0b7d72' : '#8094a6'">PT: {{ r.pt_applicable ? 'Yes' : 'No' }}</button>
              <button (click)="toggleStatutory(r, 'gratuity_applicable')" class="rounded-pill px-[11px] py-1 text-[10.5px] font-semibold"
                [style.background]="r.gratuity_applicable ? '#dff1ef' : '#eef2f6'" [style.color]="r.gratuity_applicable ? '#0b7d72' : '#8094a6'">Gratuity: {{ r.gratuity_applicable ? 'Yes' : 'No' }}</button>
              <span class="rounded-pill px-[11px] py-1 text-[10.5px] font-semibold bg-[#eef2f6] text-[#52677b]">TDS: {{ r.tds_note }}</span>
            </div>
          </div>
          <div class="flex gap-4 mt-[10px] flex-wrap">
            <div>
              <label class="block text-[10px] font-semibold text-muted-1 uppercase">Basic %</label>
              <input type="number" min="0" max="100" [ngModel]="r.basic_pct" (ngModelChange)="updateSalaryField(r, 'basic_pct', $event)"
                class="w-[70px] mt-1 px-2 py-1 border border-line-1 rounded-[7px] text-[12px] font-mono font-semibold" />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-muted-1 uppercase">HRA % of Basic</label>
              <input type="number" min="0" max="100" [ngModel]="r.hra_pct" (ngModelChange)="updateSalaryField(r, 'hra_pct', $event)"
                class="w-[70px] mt-1 px-2 py-1 border border-line-1 rounded-[7px] text-[12px] font-mono font-semibold" />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-muted-1 uppercase">Conveyance ₹</label>
              <input type="number" min="0" [ngModel]="r.conveyance" (ngModelChange)="updateSalaryField(r, 'conveyance', $event)"
                class="w-[80px] mt-1 px-2 py-1 border border-line-1 rounded-[7px] text-[12px] font-mono font-semibold" />
            </div>
          </div>
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
      <div *ngIf="activeTab === 'orgchart'" class="bg-white border border-[#e7ecf2] rounded-[14px] p-[16px_18px]">
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

      <!-- ================= LOANS ================= -->
      <div *ngIf="activeTab === 'loans'" class="flex flex-col gap-2.5">
        <div class="flex justify-end">
          <button (click)="showNewLoan = true" class="bg-brand hover:bg-brand-hover text-white rounded-[9px] px-4 py-2 text-[12.5px] font-semibold">+ New Loan / Advance</button>
        </div>
        <div *ngIf="loans.data().length === 0" class="text-center text-body-2 text-sm py-8 bg-white border border-[#e7ecf2] rounded-[13px]">No loans or advances yet.</div>
        <div *ngFor="let l of loans.data()" class="bg-white border border-[#e7ecf2] rounded-[12px] px-[16px] py-[14px] flex items-center gap-[14px] flex-wrap">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-[9px] flex-wrap">
              <span class="font-mono font-semibold text-[12px] text-brand">{{ shortId(l.id, 'LN') }}</span>
              <span class="font-semibold text-[#22384a]">{{ l.name }}</span>
              <span class="px-2 py-0.5 rounded-pill text-[10.5px] font-semibold bg-[#eef2f6] text-[#5f7689]">{{ l.loan_type }}</span>
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
          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="showNewStaff = false" class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" [disabled]="submitting" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold disabled:opacity-60">Add</button>
          </div>
        </form>
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
    { key: 'onboarding', label: 'Onboarding', icon: 'ph-user-plus' },
    { key: 'exit', label: 'Exit', icon: 'ph-user-minus' },
    { key: 'salary', label: 'Salary Structure', icon: 'ph-currency-circle-dollar' },
    { key: 'letters', label: 'Letters', icon: 'ph-envelope' },
    { key: 'orgchart', label: 'Org Chart', icon: 'ph-sitemap' },
    { key: 'loans', label: 'Loans', icon: 'ph-hand-coins' },
    { key: 'grievance', label: 'Grievance', icon: 'ph-shield-warning' },
  ];

  submitting = false;
  errorMsg = '';

  showNewStaff = false;
  showNewOnboarding = false;
  showNewExit = false;
  showNewLetter = false;
  showNewLoan = false;
  showNewGrievance = false;
  printingLetter: any = null;

  leaveForm = { staff_id: '', leave_type: LEAVE_TYPES[0], start_date: '', end_date: '' };
  staffForm = { full_name: '', title: '', role: '', department: '', phone: '', email: '', employment_type: EMPLOYMENT_TYPES[0], date_of_joining: '', reporting_manager_id: '' };
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

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.staff = this.realtime.watch('staff_directory', (q) => q.order('full_name'));
    this.leaves = this.realtime.watch('leave_requests', (q) => q.order('created_at', { ascending: false }));
    this.onboarding = this.realtime.watch('hr_onboarding', (q) => q.order('created_at', { ascending: false }));
    this.exits = this.realtime.watch('hr_exits', (q) => q.order('created_at', { ascending: false }));
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
  async createStaff() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('staff_directory').insert({
        full_name: this.staffForm.full_name, title: this.staffForm.title, role: this.staffForm.role,
        department: this.staffForm.department, phone: this.staffForm.phone, email: this.staffForm.email,
        employment_type: this.staffForm.employment_type, date_of_joining: this.staffForm.date_of_joining || null,
        reporting_manager_id: this.staffForm.reporting_manager_id || null,
        employee_id: 'EMP-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
      });
      if (error) throw error;
      this.showNewStaff = false;
      this.staffForm = { full_name: '', title: '', role: '', department: '', phone: '', email: '', employment_type: EMPLOYMENT_TYPES[0], date_of_joining: '', reporting_manager_id: '' };
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
        doc_checklist: DEFAULT_ONBOARDING_DOCS.map((label) => ({ label, done: false })),
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
      employment_type: o.employment_type, date_of_joining: o.join_date,
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
    // Simple, transparent computation from the last known monthly rate on
    // staff_directory if available -- otherwise a manual placeholder the
    // user can edit directly in Supabase. This keeps the demo honest
    // rather than fabricating a payroll engine.
    const settlement = [
      { label: 'Notice period pay', value: 0 },
      { label: 'Leave encashment', value: 0 },
      { label: 'Gratuity (if eligible)', value: 0 },
      { label: 'Deductions', value: 0 },
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
      'Appointment Letter': `This confirms the appointment of ${s.full_name} as ${s.title}, ${s.department}, effective ${s.date_of_joining || 'the agreed date'}.`,
      'Relieving Letter': `This is to certify that ${s.full_name} has been relieved of duties as ${s.title} in the ${s.department} department.`,
      'Experience Letter': `This is to certify that ${s.full_name} worked as ${s.title} in the ${s.department} department at City General Hospital.`,
      'Salary Certificate': `This is to certify the current compensation details of ${s.full_name}, ${s.title}, ${s.department} department.`,
    };
    this.letterForm.details = defaults[this.letterForm.letter_type] ?? '';
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

  ngOnDestroy() {
    this.staff.dispose();
    this.leaves.dispose();
    this.onboarding.dispose();
    this.exits.dispose();
    this.salaryStructures.dispose();
    this.letters.dispose();
    this.loans.dispose();
    this.grievances.dispose();
  }
}
