import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

const TASK_TYPES = ['Cleaning', 'Sanitization', 'Maintenance', 'Linen Change'];
const STAGES = ['Pending', 'In Progress', 'Completed'];
const NEXT_STAGE: Record<string, string> = { Pending: 'In Progress', 'In Progress': 'Completed' };
const PRIORITY_STYLE: Record<string, string> = {
  Routine: 'bg-line-2 text-body-1',
  Urgent: 'bg-warning-bg text-warning-fg',
};

interface TaskForm {
  room: string; task_type: string; priority: string; assigned_to: string;
}
const emptyForm = (): TaskForm => ({ room: '', task_type: TASK_TYPES[0], priority: 'Routine', assigned_to: '' });

@Component({
  selector: 'app-housekeeping',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>


      <div class="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <form (ngSubmit)="createTask()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">New Task</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Room / Ward</label>
            <input required [(ngModel)]="form.room" name="room" placeholder="e.g. GA-03, OT-2"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Task type</label>
            <select [(ngModel)]="form.task_type" name="task_type"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let t of taskTypes" [value]="t">{{ t }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Priority</label>
            <select [(ngModel)]="form.priority" name="priority"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="Routine">Routine</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Assigned to</label>
            <input [(ngModel)]="form.assigned_to" name="assigned_to"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Creating…' : 'Create task' }}
          </button>
        </form>

        <div class="xl:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div *ngFor="let col of stages" class="bg-white border border-line-1 rounded-card overflow-hidden">
            <div class="px-3 py-2.5 border-b border-line-1 flex items-center justify-between">
              <span class="font-semibold text-ink-2 text-[12.5px]">{{ col }}</span>
              <span class="text-[11px] text-muted-1">{{ itemsFor(col).length }}</span>
            </div>
            <div class="p-2.5 space-y-2 min-h-[100px]">
              <div *ngIf="itemsFor(col).length === 0" class="text-[11.5px] text-muted-2 text-center py-5">—</div>
              <div *ngFor="let t of itemsFor(col)" class="border border-line-1 rounded-[9px] p-2.5">
                <div class="flex items-center justify-between mb-0.5">
                  <span class="font-mono font-semibold text-ink-2 text-[12.5px]">{{ t.room }}</span>
                  <span class="px-1.5 py-0.5 rounded-pill text-[10px] font-medium" [class]="priorityStyle(t.priority)">{{ t.priority }}</span>
                </div>
                <div class="text-[11px] text-muted-1 mb-1">{{ t.task_type }}</div>
                <div class="text-[10.5px] text-muted-1 mb-2">{{ t.assigned_to || 'Unassigned' }}</div>
                <button *ngIf="nextStage(t.status)" (click)="advance(t)"
                  class="w-full text-[11.5px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5">
                  Move to {{ nextStage(t.status) }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class HousekeepingComponent implements OnDestroy {
  taskTypes = TASK_TYPES;
  stages = STAGES;
  form: TaskForm = emptyForm();
  submitting = false;
  errorMsg = '';

  tasks: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.tasks = this.realtime.watch('housekeeping_tasks', (q) => q.order('created_at', { ascending: false }));
  }

  // The reference splits Housekeeping into separate cleaning-task and
  // maintenance-ticket systems -- this module tracks both as one task list
  // (task_type distinguishes them), so KPIs are adapted to that scope.
  kpis(): KpiItem[] {
    const all = this.tasks.data();
    const completed = all.filter((t: any) => t.status === 'Completed').length;
    const completionRate = all.length ? Math.round((completed / all.length) * 100) : 0;
    return [
      { label: 'Open Tasks', value: String(all.filter((t: any) => t.status !== 'Completed').length), icon: 'ph-broom', tintKey: 'blue' },
      { label: 'Completion Rate', value: completionRate + '%', icon: 'ph-check-circle', tintKey: 'green' },
      { label: 'Urgent', value: String(all.filter((t: any) => t.priority === 'Urgent' && t.status !== 'Completed').length), icon: 'ph-warning', tintKey: 'red' },
      { label: 'Total Tasks', value: String(all.length), icon: 'ph-clipboard-text', tintKey: 'teal' },
    ];
  }

  itemsFor(status: string) {
    return this.tasks.data().filter((t: any) => (t.status ?? 'Pending') === status);
  }

  nextStage(status: string) {
    return NEXT_STAGE[status ?? 'Pending'];
  }

  priorityStyle(priority: string) {
    return PRIORITY_STYLE[priority] ?? PRIORITY_STYLE['Routine'];
  }

  async createTask() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('housekeeping_tasks').insert({
        room: this.form.room,
        task_type: this.form.task_type,
        priority: this.form.priority,
        assigned_to: this.form.assigned_to,
        status: 'Pending',
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.tasks.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async advance(task: any) {
    const next = NEXT_STAGE[task.status ?? 'Pending'];
    if (!next) return;
    const { error } = await this.supabaseService.client.from('housekeeping_tasks').update({ status: next }).eq('id', task.id);
    if (error) console.error(error);
  }

  ngOnDestroy() {
    this.tasks.dispose();
  }
}
