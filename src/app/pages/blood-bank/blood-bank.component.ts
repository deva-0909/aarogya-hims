import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { Doctor, rosterFor } from '../../core/doctors';
import { sortByPriorityThenTime } from '../../core/priority';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENTS = ['Whole Blood', 'Packed RBC', 'Platelets', 'Fresh Frozen Plasma', 'Cryoprecipitate'];
const STAGES = ['Requested', 'Cross-matching', 'Issued', 'Transfused'];
const NEXT_STAGE: Record<string, string> = {
  Requested: 'Cross-matching',
  'Cross-matching': 'Issued',
  Issued: 'Transfused',
};
const PRIORITY_STYLE: Record<string, string> = {
  Routine: 'bg-line-2 text-body-1',
  Urgent: 'bg-warning-bg text-warning-fg',
  STAT: 'bg-danger-bg text-danger-fg',
};

interface RequestForm {
  patient: string; mrn: string; blood_group: string; component: string; units: string;
  priority: string; ward: string; indication: string; requested_by: string;
}
const emptyForm = (): RequestForm => ({
  patient: '', mrn: '', blood_group: BLOOD_GROUPS[0], component: COMPONENTS[0], units: '1',
  priority: 'Routine', ward: '', indication: '', requested_by: '',
});

@Component({
  selector: 'app-blood-bank',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>

      <!-- Inventory -->
      <div class="bg-white border border-line-1 rounded-card overflow-hidden mb-6">
        <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm">Inventory by Blood Group</div>
        <div class="p-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <div *ngFor="let inv of inventory.data()" class="border rounded-[9px] p-2.5 text-center"
            [class]="isLowStock(inv) ? 'border-danger-fg bg-danger-bg/30' : 'border-line-1'">
            <div class="font-bold text-[15px] text-ink-1">{{ inv.blood_group }}</div>
            <div class="font-mono text-[16px] font-semibold" [class]="isLowStock(inv) ? 'text-danger-fg' : 'text-ink-2'">
              {{ inv.units }}
            </div>
            <div class="text-[10px] text-muted-1">units · min {{ inv.min_threshold }}</div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-4 gap-5 mb-6">
        <form (ngSubmit)="createRequest()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">New Request</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Patient name</label>
            <input required [(ngModel)]="form.patient" name="patient"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">MRN</label>
              <input [(ngModel)]="form.mrn" name="mrn"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Ward</label>
              <input [(ngModel)]="form.ward" name="ward"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Blood group</label>
              <select [(ngModel)]="form.blood_group" name="blood_group"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option *ngFor="let g of bloodGroups" [value]="g">{{ g }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Units</label>
              <input type="number" min="1" [(ngModel)]="form.units" name="units"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Component</label>
            <select [(ngModel)]="form.component" name="component"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let c of components" [value]="c">{{ c }}</option>
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
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Indication</label>
            <input [(ngModel)]="form.indication" name="indication" placeholder="e.g. Hb 6.2, ongoing GI bleed"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Requested by</label>
            <select required [(ngModel)]="form.requested_by" name="requested_by"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="" disabled>Select a doctor</option>
              <option *ngFor="let d of doctorOptions()" [value]="d.full_name">{{ d.full_name }} — {{ d.department }}</option>
            </select>
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Submitting…' : 'Submit request' }}
          </button>
        </form>

        <!-- Kanban -->
        <div class="xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div *ngFor="let col of stages" class="bg-white border border-line-1 rounded-card overflow-hidden">
            <div class="px-3 py-2.5 border-b border-line-1 flex items-center justify-between">
              <span class="font-semibold text-ink-2 text-[12.5px]">{{ col }}</span>
              <span class="text-[11px] text-muted-1">{{ itemsFor(col).length }}</span>
            </div>
            <div class="p-2.5 space-y-2 min-h-[100px]">
              <div *ngIf="itemsFor(col).length === 0" class="text-[11.5px] text-muted-2 text-center py-5">—</div>
              <div *ngFor="let r of itemsFor(col)" class="border border-line-1 rounded-[9px] p-2.5">
                <div class="flex items-center justify-between mb-0.5">
                  <span class="font-medium text-ink-2 text-[12.5px] truncate">{{ r.patient }}</span>
                  <span class="px-1.5 py-0.5 rounded-pill text-[10px] font-medium flex-none" [class]="priorityStyle(r.priority)">{{ r.priority }}</span>
                </div>
                <div class="text-[11px] text-muted-1 mb-1">{{ r.blood_group }} · {{ r.units }}u · {{ r.component }}</div>
                <div class="text-[10.5px] text-muted-1 mb-2">{{ r.ward || '—' }} · {{ r.requested_by }}</div>
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
export class BloodBankComponent implements OnDestroy {
  bloodGroups = BLOOD_GROUPS;
  components = COMPONENTS;
  stages = STAGES;
  form: RequestForm = emptyForm();
  submitting = false;
  errorMsg = '';

  requests: RealtimeTableHandle<any>;
  inventory: RealtimeTableHandle<any>;
  doctors: RealtimeTableHandle<Doctor>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.requests = this.realtime.watch('blood_requests', (q) => q.order('created_at', { ascending: false }));
    this.inventory = this.realtime.watch('blood_inventory', (q) => q.order('blood_group'));
    this.doctors = this.realtime.watch<Doctor>('doctors', (q) => q.eq('active', true).order('full_name'));
  }

  doctorOptions(): Doctor[] {
    return rosterFor(this.doctors.data());
  }

  // Matches the reference's Blood Bank KPI row and formulas for the first
  // 3 cards exactly. The reference's 4th card ("Donors (MTD)") is a static
  // fabricated number -- we don't track donor registrations in this schema
  // -- replaced with a real "Transfused" count instead of copying fake data.
  kpis(): KpiItem[] {
    const inv = this.inventory.data();
    const req = this.requests.data();
    return [
      { label: 'Total Units', value: String(inv.reduce((sum: number, g: any) => sum + Number(g.units || 0), 0)), icon: 'ph-drop', tintKey: 'magenta' },
      { label: 'Groups Below Min', value: String(inv.filter((g: any) => this.isLowStock(g)).length), icon: 'ph-warning', tintKey: 'red' },
      { label: 'Open Requests', value: String(req.filter((r: any) => r.stage !== 'Transfused').length), icon: 'ph-clipboard-text', tintKey: 'blue' },
      { label: 'Transfused', value: String(req.filter((r: any) => r.stage === 'Transfused').length), icon: 'ph-check-circle', tintKey: 'green' },
    ];
  }

  // Priority-sorted within each stage -- STAT rises to the top.
  itemsFor(stage: string) {
    return sortByPriorityThenTime(this.requests.data().filter((r: any) => (r.stage ?? 'Requested') === stage));
  }

  nextStage(stage: string) {
    return NEXT_STAGE[stage ?? 'Requested'];
  }

  priorityStyle(priority: string) {
    return PRIORITY_STYLE[priority] ?? PRIORITY_STYLE['Routine'];
  }

  isLowStock(inv: any) {
    return inv.min_threshold != null && inv.units <= inv.min_threshold;
  }

  async createRequest() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('blood_requests').insert({
        patient: this.form.patient,
        mrn: this.form.mrn,
        blood_group: this.form.blood_group,
        component: this.form.component,
        units: Number(this.form.units || 1),
        priority: this.form.priority,
        ward: this.form.ward,
        indication: this.form.indication,
        requested_by: this.form.requested_by,
        stage: 'Requested',
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

  // Moving to "Issued" checks and decrements the matching blood_group's
  // inventory. Blocked (with a clear message) if there isn't enough stock,
  // rather than silently going negative.
  async advance(req: any) {
    const next = NEXT_STAGE[req.stage ?? 'Requested'];
    if (!next) return;
    const client = this.supabaseService.client;

    if (next === 'Issued') {
      const invRow = this.inventory.data().find((i: any) => i.blood_group === req.blood_group);
      if (!invRow || invRow.units < req.units) {
        alert(
          `Not enough ${req.blood_group} in stock to issue ${req.units} unit(s) — ` +
          `only ${invRow?.units ?? 0} available. Update inventory first.`
        );
        return;
      }
      const { error: invErr } = await client
        .from('blood_inventory')
        .update({ units: invRow.units - req.units })
        .eq('id', invRow.id);
      if (invErr) {
        alert(invErr.message);
        return;
      }
    }

    const { error } = await client.from('blood_requests').update({ stage: next }).eq('id', req.id);
    if (error) console.error(error);
  }

  ngOnDestroy() {
    this.requests.dispose();
    this.inventory.dispose();
    this.doctors.dispose();
  }
}
