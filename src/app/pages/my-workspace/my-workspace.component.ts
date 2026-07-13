import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Maternity/Paternity', 'Unpaid'];
const STATUS_STYLE: Record<string, string> = {
  Pending: 'bg-warning-bg text-warning-fg',
  Approved: 'bg-success-bg text-success-fg',
  Rejected: 'bg-danger-bg text-danger-fg',
};

interface LeaveForm {
  leave_type: string; start_date: string; end_date: string;
}
const emptyForm = (): LeaveForm => ({ leave_type: LEAVE_TYPES[0], start_date: '', end_date: '' });

@Component({
  selector: 'app-my-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>
      <p class="text-[12.5px] text-muted-1 mb-4">
        No login in this demo — pick who you are below to see their leave history and submit requests on their behalf.
      </p>

      <div class="bg-white border border-line-1 rounded-card p-4 mb-5 flex items-center gap-3">
        <label class="text-xs font-medium text-body-1 flex-none">I am:</label>
        <select [(ngModel)]="selectedStaffId" name="selectedStaffId"
          class="flex-1 max-w-sm border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
          <option value="" disabled>Select yourself</option>
          <option *ngFor="let s of staff.data()" [value]="s.id">{{ s.full_name }} — {{ s.title }}</option>
        </select>
      </div>

      <div *ngIf="selectedStaffId" class="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-6">
        <form (ngSubmit)="requestLeave()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">Request Leave</h2>
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
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Submitting…' : 'Submit request' }}
          </button>
        </form>

        <div class="xl:col-span-2 bg-white border border-line-1 rounded-card overflow-hidden">
          <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm">My Leave History</div>
          <div class="overflow-x-auto"><table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                <th class="px-4 py-2 font-medium">Type</th>
                <th class="px-4 py-2 font-medium">Dates</th>
                <th class="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngIf="myLeaves().length === 0">
                <td colspan="3" class="px-4 py-6 text-center text-body-2">No leave requests yet.</td>
              </tr>
              <tr *ngFor="let l of myLeaves()" class="border-b border-line-2 last:border-0">
                <td class="px-4 py-2 text-body-1">{{ l.leave_type }}</td>
                <td class="px-4 py-2 font-mono text-[12.5px] text-body-1">{{ l.start_date }} → {{ l.end_date }}</td>
                <td class="px-4 py-2">
                  <span class="px-2 py-0.5 rounded-pill text-[11.5px] font-medium" [class]="statusStyle(l.status)">{{ l.status }}</span>
                </td>
              </tr>
            </tbody>
          </table></div>
        </div>
      </div>

      <div class="bg-white border border-line-1 rounded-card overflow-hidden">
        <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm">Hospital Notice Board</div>
        <div class="p-4 space-y-3">
          <div *ngIf="!notices.loading() && notices.data().length === 0" class="text-center text-body-2 text-sm py-4">
            No notices posted yet.
          </div>
          <div *ngFor="let n of notices.data()" class="border border-line-1 rounded-[9px] p-3">
            <div class="font-medium text-ink-2 text-sm mb-0.5">{{ n.title }}</div>
            <div class="text-[12.5px] text-body-1 mb-1">{{ n.body }}</div>
            <div class="text-[11px] text-muted-1">{{ n.posted_by || 'Admin' }} · {{ n.created_at | date: 'mediumDate' }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MyWorkspaceComponent implements OnDestroy {
  leaveTypes = LEAVE_TYPES;
  selectedStaffId = '';
  form: LeaveForm = emptyForm();
  submitting = false;
  errorMsg = '';

  staff: RealtimeTableHandle<any>;
  leaves: RealtimeTableHandle<any>;
  notices: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.staff = this.realtime.watch('staff_directory', (q) => q.order('full_name'));
    this.leaves = this.realtime.watch('leave_requests', (q) => q.order('created_at', { ascending: false }));
    this.notices = this.realtime.watch('notices', (q) => q.order('created_at', { ascending: false }));
  }

  myLeaves() {
    return this.leaves.data().filter((l: any) => l.staff_id === this.selectedStaffId);
  }

  statusStyle(status: string) {
    return STATUS_STYLE[status] ?? STATUS_STYLE['Pending'];
  }

  async requestLeave() {
    if (!this.selectedStaffId) return;
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('leave_requests').insert({
        staff_id: this.selectedStaffId,
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

  ngOnDestroy() {
    this.staff.dispose();
    this.leaves.dispose();
    this.notices.dispose();
  }
}
