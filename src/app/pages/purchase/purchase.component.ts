import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';

const STAGES = ['Pending Approval', 'Approved', 'PO Raised', 'Received'];
const NEXT_STAGE: Record<string, string> = {
  'Pending Approval': 'Approved',
  Approved: 'PO Raised',
  'PO Raised': 'Received',
};

interface ReqForm {
  item: string; quantity: string; requested_by: string; notes: string;
}
const emptyForm = (): ReqForm => ({ item: '', quantity: '1', requested_by: '', notes: '' });

@Component({
  selector: 'app-purchase',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>
      <h1 class="text-xl font-semibold text-ink-1 mb-4">Purchase & Procurement</h1>

      <div class="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <form (ngSubmit)="createRequisition()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">New Requisition</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Item</label>
            <input required [(ngModel)]="form.item" name="item" placeholder="e.g. N95 masks, box of 50"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Quantity</label>
            <input type="number" min="1" [(ngModel)]="form.quantity" name="quantity"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Requested by</label>
            <select required [(ngModel)]="form.requested_by" name="requested_by"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="" disabled>Select staff</option>
              <option *ngFor="let s of staff.data()" [value]="s.id">{{ s.full_name }} — {{ s.department }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Notes</label>
            <input [(ngModel)]="form.notes" name="notes"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting || staff.data().length === 0"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Submitting…' : 'Submit requisition' }}
          </button>
          <p *ngIf="staff.data().length === 0" class="text-[11.5px] text-muted-1">
            No staff on file yet — add staff via the HR module first.
          </p>
        </form>

        <div class="xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div *ngFor="let col of stages" class="bg-white border border-line-1 rounded-card overflow-hidden">
            <div class="px-3 py-2.5 border-b border-line-1 flex items-center justify-between">
              <span class="font-semibold text-ink-2 text-[12.5px]">{{ col }}</span>
              <span class="text-[11px] text-muted-1">{{ itemsFor(col).length }}</span>
            </div>
            <div class="p-2.5 space-y-2 min-h-[100px]">
              <div *ngIf="itemsFor(col).length === 0" class="text-[11.5px] text-muted-2 text-center py-5">—</div>
              <div *ngFor="let r of itemsFor(col)" class="border border-line-1 rounded-[9px] p-2.5">
                <div class="font-medium text-ink-2 text-[12.5px] mb-0.5">{{ r.item }}</div>
                <div class="text-[11px] text-muted-1 mb-1">Qty {{ r.quantity }}</div>
                <div class="text-[10.5px] text-muted-1 mb-2">{{ staffName(r.requested_by) }}</div>
                <button *ngIf="nextStage(r.stage)" (click)="advance(r)"
                  class="w-full text-[11.5px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5">
                  Move to {{ nextStage(r.stage) }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PurchaseComponent implements OnDestroy {
  stages = STAGES;
  form: ReqForm = emptyForm();
  submitting = false;
  errorMsg = '';

  requisitions: RealtimeTableHandle<any>;
  staff: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.requisitions = this.realtime.watch('purchase_requisitions', (q) => q.order('created_at', { ascending: false }));
    this.staff = this.realtime.watch('staff_directory', (q) => q.order('full_name'));
  }

  itemsFor(stage: string) {
    return this.requisitions.data().filter((r: any) => (r.stage ?? 'Pending Approval') === stage);
  }

  nextStage(stage: string) {
    return NEXT_STAGE[stage ?? 'Pending Approval'];
  }

  staffName(staffId: string) {
    return this.staff.data().find((s: any) => s.id === staffId)?.full_name ?? 'Unknown';
  }

  async createRequisition() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('purchase_requisitions').insert({
        item: this.form.item,
        quantity: Number(this.form.quantity || 1),
        requested_by: this.form.requested_by,
        notes: this.form.notes,
        stage: 'Pending Approval',
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.requisitions.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async advance(req: any) {
    const next = NEXT_STAGE[req.stage ?? 'Pending Approval'];
    if (!next) return;
    const { error } = await this.supabaseService.client.from('purchase_requisitions').update({ stage: next }).eq('id', req.id);
    if (error) console.error(error);
  }

  ngOnDestroy() {
    this.requisitions.dispose();
    this.staff.dispose();
  }
}
