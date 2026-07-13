import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Maternity/Paternity', 'Unpaid'];
const STATUS_STYLE: Record<string, string> = {
  Pending: 'bg-warning-bg text-warning-fg',
  Approved: 'bg-success-bg text-success-fg',
  Rejected: 'bg-danger-bg text-danger-fg',
};

interface LeaveForm {
  staff_id: string; leave_type: string; start_date: string; end_date: string;
}
const emptyForm = (): LeaveForm => ({ staff_id: '', leave_type: LEAVE_TYPES[0], start_date: '', end_date: '' });

@Component({
  selector: 'app-hr',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>


      <div class="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-6">
        <!-- Staff directory -->
        <div class="xl:col-span-2 bg-white border border-line-1 rounded-card overflow-hidden">
          <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm">Staff Directory ({{ staff.data().length }})</div>
          <div class="overflow-x-auto"><table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                <th class="px-4 py-2 font-medium">Name</th>
                <th class="px-4 py-2 font-medium">Role / Dept</th>
                <th class="px-4 py-2 font-medium">Contact</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let s of staff.data()" class="border-b border-line-2 last:border-0">
                <td class="px-4 py-2">
                  <div class="font-medium text-ink-2">{{ s.full_name }}</div>
                  <div class="text-[11.5px] text-muted-1">{{ s.title }}</div>
                </td>
                <td class="px-4 py-2">
                  <div class="text-body-1 capitalize">{{ s.role }}</div>
                  <div class="text-[11.5px] text-muted-1">{{ s.department }}</div>
                </td>
                <td class="px-4 py-2 text-[12.5px] text-body-1">
                  <div>{{ s.phone }}</div>
                  <div class="text-muted-1">{{ s.email }}</div>
                </td>
              </tr>
            </tbody>
          </table></div>
        </div>

        <!-- New leave request -->
        <form (ngSubmit)="createLeave()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">Request Leave</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Staff member</label>
            <select required [(ngModel)]="form.staff_id" name="staff_id"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="" disabled>Select staff</option>
              <option *ngFor="let s of staff.data()" [value]="s.id">{{ s.full_name }} — {{ s.title }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Leave type</label>
            <select [(ngModel)]="form.leave_type" name="leave_type"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let t of leaveTypes" [value]="t">{{ t }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">From</label>
              <input required type="date" [(ngModel)]="form.start_date" name="start_date"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">To</label>
              <input required type="date" [(ngModel)]="form.end_date" name="end_date"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting || staff.data().length === 0"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Submitting…' : 'Submit request' }}
          </button>
        </form>
      </div>

      <!-- Leave requests -->
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
                <span class="px-2 py-0.5 rounded-pill text-[11.5px] font-medium" [class]="statusStyle(l.status)">{{ l.status }}</span>
              </td>
              <td class="px-4 py-2 text-right" *ngIf="l.status === 'Pending'">
                <button (click)="setStatus(l, 'Approved')" class="text-[12px] font-semibold text-success-fg hover:underline mr-3">Approve</button>
                <button (click)="setStatus(l, 'Rejected')" class="text-[12px] font-semibold text-danger-fg hover:underline">Reject</button>
              </td>
            </tr>
          </tbody>
        </table></div>
      </div>
    </div>
  `,
})
export class HrComponent implements OnDestroy {
  leaveTypes = LEAVE_TYPES;
  form: LeaveForm = emptyForm();
  submitting = false;
  errorMsg = '';

  staff: RealtimeTableHandle<any>;
  leaves: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.staff = this.realtime.watch('staff_directory', (q) => q.order('full_name'));
    this.leaves = this.realtime.watch('leave_requests', (q) => q.order('created_at', { ascending: false }));
  }

  // The reference's HR default view ("Staff Roster") tracks shift
  // assignments and on-duty status we don't model here (staff_directory has
  // no shift/duty field) -- adapted to real staff + leave data instead.
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

  staffName(staffId: string) {
    return this.staff.data().find((s: any) => s.id === staffId)?.full_name ?? 'Unknown';
  }

  statusStyle(status: string) {
    return STATUS_STYLE[status] ?? STATUS_STYLE['Pending'];
  }

  async createLeave() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('leave_requests').insert({
        staff_id: this.form.staff_id,
        leave_type: this.form.leave_type,
        start_date: this.form.start_date,
        end_date: this.form.end_date,
        status: 'Pending',
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.leaves.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async setStatus(leave: any, status: string) {
    const { error } = await this.supabaseService.client.from('leave_requests').update({ status }).eq('id', leave.id);
    if (error) console.error(error);
  }

  ngOnDestroy() {
    this.staff.dispose();
    this.leaves.dispose();
  }
}
