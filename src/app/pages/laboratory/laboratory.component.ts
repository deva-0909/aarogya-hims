import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { Doctor, rosterFor } from '../../core/doctors';
import { sortByPriorityThenTime } from '../../core/priority';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

const SAMPLE_TYPES = ['Blood', 'Urine', 'Stool', 'Sputum', 'Swab', 'CSF', 'Other'];
const COMMON_TESTS = [
  'Complete Blood Count (CBC)', 'Blood Sugar (Fasting)', 'Blood Sugar (PP)', 'Lipid Profile',
  'Liver Function Test (LFT)', 'Kidney Function Test (KFT)', 'Thyroid Profile (T3/T4/TSH)',
  'Urine Routine', 'HbA1c', 'Widal Test', 'Dengue NS1', 'Malaria Antigen', 'COVID-19 RT-PCR',
  'Blood Culture', 'ESR', 'CRP',
];

const STAGES = ['Registered', 'Sample Collected', 'In Process', 'Reported', 'Validated'];
const NEXT_STAGE: Record<string, string> = {
  Registered: 'Sample Collected',
  'Sample Collected': 'In Process',
  'In Process': 'Reported',
  Reported: 'Validated',
};

const PRIORITY_STYLE: Record<string, string> = {
  Routine: 'bg-line-2 text-body-1',
  Urgent: 'bg-warning-bg text-warning-fg',
  STAT: 'bg-danger-bg text-danger-fg',
};

interface OrderForm {
  patient: string; mrn: string; test: string; sample: string; priority: string; ordering_doctor: string;
}
const emptyForm = (): OrderForm => ({ patient: '', mrn: '', test: '', sample: SAMPLE_TYPES[0], priority: 'Routine', ordering_doctor: '' });

@Component({
  selector: 'app-laboratory',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>

      <div class="grid grid-cols-1 xl:grid-cols-4 gap-5 mb-6">
        <form (ngSubmit)="createOrder()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">New Lab Order</h2>

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
            <label class="block text-xs font-medium text-body-1 mb-1">Test</label>
            <input required [(ngModel)]="form.test" name="test" list="common-tests" placeholder="Start typing…"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            <datalist id="common-tests">
              <option *ngFor="let t of commonTests" [value]="t"></option>
            </datalist>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Sample</label>
              <select [(ngModel)]="form.sample" name="sample"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option *ngFor="let s of sampleTypes" [value]="s">{{ s }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Priority</label>
              <select [(ngModel)]="form.priority" name="priority"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option value="Routine">Routine</option>
                <option value="Urgent">Urgent</option>
                <option value="STAT">STAT</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Ordering doctor</label>
            <select required [(ngModel)]="form.ordering_doctor" name="ordering_doctor"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="" disabled>Select a doctor</option>
              <option *ngFor="let d of doctorOptions()" [value]="d.full_name">{{ d.full_name }} — {{ d.department }}</option>
            </select>
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Registering…' : 'Register order' }}
          </button>
        </form>

        <!-- Kanban -->
        <div class="xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div *ngFor="let col of stages" class="bg-white border border-line-1 rounded-card overflow-hidden">
            <div class="px-3 py-2.5 border-b border-line-1 flex items-center justify-between">
              <span class="font-semibold text-ink-2 text-[12.5px]">{{ col }}</span>
              <span class="text-[11px] text-muted-1">{{ itemsFor(col).length }}</span>
            </div>
            <div class="p-2.5 space-y-2 min-h-[100px]">
              <div *ngIf="itemsFor(col).length === 0" class="text-[11.5px] text-muted-2 text-center py-5">—</div>
              <div *ngFor="let o of itemsFor(col)" class="border rounded-[9px] p-2.5"
                [class]="o.critical ? 'border-danger-fg bg-danger-bg/30' : 'border-line-1'">
                <div class="flex items-center justify-between mb-0.5">
                  <span class="font-medium text-ink-2 text-[12.5px] truncate">{{ o.patient }}</span>
                  <span class="px-1.5 py-0.5 rounded-pill text-[10px] font-medium flex-none" [class]="priorityStyle(o.priority)">{{ o.priority }}</span>
                </div>
                <div class="text-[11px] text-muted-1 mb-1">{{ o.test }}</div>
                <div class="text-[10.5px] text-muted-1 mb-2">{{ o.sample }} · {{ o.ordering_doctor || '—' }}</div>
                <div *ngIf="o.critical" class="text-[10.5px] font-semibold text-danger-fg mb-1.5 flex items-center gap-1">
                  <i class="ph ph-warning-circle"></i> Critical value
                </div>
                <button *ngIf="nextStage(o.stage) === 'Reported'" (click)="openReport(o)"
                  class="w-full text-[11.5px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5">
                  Enter result
                </button>
                <button *ngIf="nextStage(o.stage) && nextStage(o.stage) !== 'Reported'" (click)="advance(o)"
                  class="w-full text-[11.5px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5">
                  Move to {{ nextStage(o.stage) }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Report entry modal -->
      <div *ngIf="reportingOrder" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="reportingOrder = null">
        <form (ngSubmit)="submitReport()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-md space-y-3">
          <h3 class="font-semibold text-ink-2">Enter result — {{ reportingOrder.patient }} ({{ reportingOrder.test }})</h3>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Result summary</label>
            <textarea required [(ngModel)]="reportSummary" name="reportSummary" rows="4"
              placeholder="e.g. Hb 13.2 g/dL, WBC 7,800/uL, Platelets 2.4L/uL — all within normal range"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand"></textarea>
          </div>
          <label class="flex items-center gap-2 text-sm text-body-1">
            <input type="checkbox" [(ngModel)]="reportCritical" name="reportCritical" class="rounded" />
            Flag as a critical value (requires urgent physician notification)
          </label>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="reportingOrder = null"
              class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold">
              Save & move to Reported
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class LaboratoryComponent implements OnDestroy {
  stages = STAGES;
  sampleTypes = SAMPLE_TYPES;
  commonTests = COMMON_TESTS;
  form: OrderForm = emptyForm();
  submitting = false;
  errorMsg = '';

  reportingOrder: any = null;
  reportSummary = '';
  reportCritical = false;

  orders: RealtimeTableHandle<any>;
  doctors: RealtimeTableHandle<Doctor>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.orders = this.realtime.watch('lab_orders', (q) => q.order('created_at', { ascending: false }));
    this.doctors = this.realtime.watch<Doctor>('doctors', (q) => q.eq('active', true).order('full_name'));
  }

  doctorOptions(): Doctor[] {
    return rosterFor(this.doctors.data());
  }

  // The reference prototype doesn't define custom KPIs for Laboratory (it
  // falls back to a generic placeholder row) -- these are real, useful
  // metrics in the same visual style rather than replicating a meaningless
  // placeholder.
  // Matches the reference's exact Lab KPI row and formulas (labPending /
  // labReported / labCritCount / labStat).
  kpis(): KpiItem[] {
    const all = this.orders.data();
    return [
      { label: 'Pending', value: String(all.filter((o: any) => o.stage !== 'Validated').length), icon: 'ph-flask', tintKey: 'blue' },
      { label: 'Awaiting Validation', value: String(all.filter((o: any) => o.stage === 'Reported').length), icon: 'ph-eye', tintKey: 'amber' },
      { label: 'Critical Values', value: String(all.filter((o: any) => o.critical).length), icon: 'ph-warning-circle', tintKey: 'red' },
      { label: 'STAT Pending', value: String(all.filter((o: any) => o.priority === 'STAT' && o.stage !== 'Validated').length), icon: 'ph-warning', tintKey: 'teal' },
    ];
  }

  // Priority-sorted within each stage -- STAT rises to the top, same
  // principle as the ED Triage Board.
  itemsFor(stage: string) {
    return sortByPriorityThenTime(this.orders.data().filter((o: any) => (o.stage ?? 'Registered') === stage));
  }

  nextStage(stage: string) {
    return NEXT_STAGE[stage ?? 'Registered'];
  }

  priorityStyle(priority: string) {
    return PRIORITY_STYLE[priority] ?? PRIORITY_STYLE['Routine'];
  }

  async createOrder() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('lab_orders').insert({
        patient: this.form.patient,
        mrn: this.form.mrn,
        test: this.form.test,
        sample: this.form.sample,
        priority: this.form.priority,
        ordering_doctor: this.form.ordering_doctor,
        stage: 'Registered',
        results: [],
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.orders.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async advance(order: any) {
    const next = NEXT_STAGE[order.stage ?? 'Registered'];
    if (!next) return;
    const { error } = await this.supabaseService.client.from('lab_orders').update({ stage: next }).eq('id', order.id);
    if (error) console.error(error);
  }

  openReport(order: any) {
    this.reportingOrder = order;
    this.reportSummary = '';
    this.reportCritical = false;
  }

  async submitReport() {
    if (!this.reportingOrder) return;
    const existing = Array.isArray(this.reportingOrder.results) ? this.reportingOrder.results : [];
    const { error } = await this.supabaseService.client
      .from('lab_orders')
      .update({
        stage: 'Reported',
        critical: this.reportCritical,
        results: [...existing, { summary: this.reportSummary, reported_at: new Date().toISOString() }],
      })
      .eq('id', this.reportingOrder.id);
    if (error) {
      alert(error.message);
      return;
    }
    this.reportingOrder = null;
    await this.orders.refresh();
  }

  ngOnDestroy() {
    this.orders.dispose();
    this.doctors.dispose();
  }
}
