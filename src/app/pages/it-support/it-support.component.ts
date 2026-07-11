import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';

const CATEGORIES = ['Hardware', 'Software', 'Network', 'Account', 'Other'];
const STAGES = ['Open', 'In Progress', 'Resolved', 'Closed'];
const NEXT_STAGE: Record<string, string> = { Open: 'In Progress', 'In Progress': 'Resolved', Resolved: 'Closed' };
const PRIORITY_STYLE: Record<string, string> = {
  Routine: 'bg-line-2 text-body-1',
  Urgent: 'bg-warning-bg text-warning-fg',
  Critical: 'bg-danger-bg text-danger-fg',
};

interface TicketForm {
  title: string; description: string; category: string; priority: string; raised_by: string;
}
const emptyForm = (): TicketForm => ({ title: '', description: '', category: CATEGORIES[0], priority: 'Routine', raised_by: '' });

@Component({
  selector: 'app-it-support',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>

      <div class="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <form (ngSubmit)="createTicket()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">New Ticket</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Title</label>
            <input required [(ngModel)]="form.title" name="title" placeholder="e.g. OPD printer not working"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Description</label>
            <textarea [(ngModel)]="form.description" name="description" rows="3"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Category</label>
              <select [(ngModel)]="form.category" name="category"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option *ngFor="let c of categories" [value]="c">{{ c }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Priority</label>
              <select [(ngModel)]="form.priority" name="priority"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option value="Routine">Routine</option>
                <option value="Urgent">Urgent</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Raised by</label>
            <input [(ngModel)]="form.raised_by" name="raised_by" placeholder="Name or department"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Submitting…' : 'Raise ticket' }}
          </button>
        </form>

        <div class="xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div *ngFor="let col of stages" class="bg-white border border-line-1 rounded-card overflow-hidden">
            <div class="px-3 py-2.5 border-b border-line-1 flex items-center justify-between">
              <span class="font-semibold text-ink-2 text-[12.5px]">{{ col }}</span>
              <span class="text-[11px] text-muted-1">{{ itemsFor(col).length }}</span>
            </div>
            <div class="p-2.5 space-y-2 min-h-[100px]">
              <div *ngIf="itemsFor(col).length === 0" class="text-[11.5px] text-muted-2 text-center py-5">—</div>
              <div *ngFor="let t of itemsFor(col)" class="border border-line-1 rounded-[9px] p-2.5">
                <div class="flex items-center justify-between mb-0.5">
                  <span class="font-medium text-ink-2 text-[12.5px] truncate">{{ t.title }}</span>
                  <span class="px-1.5 py-0.5 rounded-pill text-[10px] font-medium flex-none" [class]="priorityStyle(t.priority)">{{ t.priority }}</span>
                </div>
                <div class="text-[11px] text-muted-1 mb-1">{{ t.category }}</div>
                <div class="text-[10.5px] text-muted-1 mb-2">{{ t.raised_by || '—' }}</div>
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
export class ItSupportComponent implements OnDestroy {
  categories = CATEGORIES;
  stages = STAGES;
  form: TicketForm = emptyForm();
  submitting = false;
  errorMsg = '';

  tickets: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.tickets = this.realtime.watch('it_tickets', (q) => q.order('created_at', { ascending: false }));
  }

  itemsFor(status: string) {
    return this.tickets.data().filter((t: any) => (t.status ?? 'Open') === status);
  }

  nextStage(status: string) {
    return NEXT_STAGE[status ?? 'Open'];
  }

  priorityStyle(priority: string) {
    return PRIORITY_STYLE[priority] ?? PRIORITY_STYLE['Routine'];
  }

  async createTicket() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('it_tickets').insert({
        title: this.form.title,
        description: this.form.description,
        category: this.form.category,
        priority: this.form.priority,
        raised_by: this.form.raised_by,
        status: 'Open',
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.tickets.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async advance(ticket: any) {
    const next = NEXT_STAGE[ticket.status ?? 'Open'];
    if (!next) return;
    const { error } = await this.supabaseService.client.from('it_tickets').update({ status: next }).eq('id', ticket.id);
    if (error) console.error(error);
  }

  ngOnDestroy() {
    this.tickets.dispose();
  }
}
