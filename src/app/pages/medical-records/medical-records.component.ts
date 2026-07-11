import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

const PURPOSES = ['Patient Copy', 'Insurance', 'Legal', 'Referral', 'Other'];
const STAGES = ['Requested', 'In Progress', 'Ready', 'Delivered'];
const NEXT_STAGE: Record<string, string> = {
  Requested: 'In Progress',
  'In Progress': 'Ready',
  Ready: 'Delivered',
};

interface RequestForm {
  patient: string; mrn: string; purpose: string; requested_by: string;
}
const emptyForm = (): RequestForm => ({ patient: '', mrn: '', purpose: PURPOSES[0], requested_by: '' });

@Component({
  selector: 'app-medical-records',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>


      <div class="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <form (ngSubmit)="createRequest()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">New Request</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Patient name</label>
            <input required [(ngModel)]="form.patient" name="patient"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">MRN</label>
            <input [(ngModel)]="form.mrn" name="mrn"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Purpose</label>
            <select [(ngModel)]="form.purpose" name="purpose"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let p of purposes" [value]="p">{{ p }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Requested by</label>
            <input [(ngModel)]="form.requested_by" name="requested_by" placeholder="Name or department"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Submitting…' : 'Submit request' }}
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
              <div *ngFor="let r of itemsFor(col)" class="border border-line-1 rounded-[9px] p-2.5">
                <div class="font-medium text-ink-2 text-[12.5px] mb-0.5">{{ r.patient }}</div>
                <div class="text-[11px] text-muted-1 mb-1">{{ r.mrn || '—' }} · {{ r.purpose }}</div>
                <div class="text-[10.5px] text-muted-1 mb-2">{{ r.requested_by || '—' }}</div>
                <button *ngIf="nextStage(r.status)" (click)="advance(r)"
                  class="w-full text-[11.5px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5">
                  Move to {{ nextStage(r.status) }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MedicalRecordsComponent implements OnDestroy {
  purposes = PURPOSES;
  stages = STAGES;
  form: RequestForm = emptyForm();
  submitting = false;
  errorMsg = '';

  requests: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.requests = this.realtime.watch('medical_records_requests', (q) => q.order('created_at', { ascending: false }));
  }

  // The reference's Medical Records module is a full EHR/coding system
  // (encounter coding, chart pulls) we don't model here -- this module only
  // tracks document/copy requests, so these KPIs are adapted to that scope
  // rather than replicating "EHR Records"/"Coding Complete %" we have no
  // data behind.
  kpis(): KpiItem[] {
    const all = this.requests.data();
    const monthStart = new Date().toISOString().slice(0, 7);
    const deliveredThisMonth = all.filter((r: any) => r.status === 'Delivered' && (r.created_at ?? '').slice(0, 7) === monthStart);
    return [
      { label: 'Open Requests', value: String(all.filter((r: any) => r.status !== 'Delivered').length), icon: 'ph-folders', tintKey: 'blue' },
      { label: 'Ready for Pickup', value: String(all.filter((r: any) => r.status === 'Ready').length), icon: 'ph-check-circle', tintKey: 'amber' },
      { label: 'Delivered (MTD)', value: String(deliveredThisMonth.length), icon: 'ph-package', tintKey: 'green' },
      { label: 'Total Requests', value: String(all.length), icon: 'ph-identification-card', tintKey: 'teal' },
    ];
  }

  itemsFor(status: string) {
    return this.requests.data().filter((r: any) => (r.status ?? 'Requested') === status);
  }

  nextStage(status: string) {
    return NEXT_STAGE[status ?? 'Requested'];
  }

  async createRequest() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('medical_records_requests').insert({
        patient: this.form.patient,
        mrn: this.form.mrn,
        purpose: this.form.purpose,
        requested_by: this.form.requested_by,
        status: 'Requested',
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.requests.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async advance(req: any) {
    const next = NEXT_STAGE[req.status ?? 'Requested'];
    if (!next) return;
    const { error } = await this.supabaseService.client.from('medical_records_requests').update({ status: next }).eq('id', req.id);
    if (error) console.error(error);
  }

  ngOnDestroy() {
    this.requests.dispose();
  }
}
