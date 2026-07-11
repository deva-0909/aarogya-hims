import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { Doctor, rosterFor } from '../../core/doctors';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

interface RxItem {
  drug: string;
  dose: string;
  freq: string;
  dur: string;
  qty: number;
}

interface RxForm {
  patient: string;
  mrn: string;
  prescriber: string;
  ward: string;
  priority: 'Routine' | 'Urgent' | 'STAT';
  allergy: string;
  items: RxItem[];
}

const STATUS_FLOW = ['Queued', 'Verifying', 'Ready', 'Dispensed'];
const NEXT_STATUS: Record<string, string> = {
  Queued: 'Verifying',
  Verifying: 'Ready',
  Ready: 'Dispensed',
};

// Exact priority pill colors from the reference's Pharmacy queue (2-tier:
// STAT is red, everything else is neutral grey -- unlike the 3-tier
// STAT/Urgent/Routine used elsewhere in the app).
function priorityColor(priority: string) {
  return priority === 'STAT' ? { bg: '#fbe3e3', fg: '#b42318' } : { bg: '#eaeef3', fg: '#51687d' };
}

function emptyItem(): RxItem {
  return { drug: '', dose: '', freq: '', dur: '', qty: 1 };
}
function emptyForm(): RxForm {
  return { patient: '', mrn: '', prescriber: '', ward: '', priority: 'Routine', allergy: '', items: [emptyItem()] };
}

@Component({
  selector: 'app-pharmacy',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent, StatusBadgeComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-6">
        <!-- New prescription -->
        <form (ngSubmit)="createPrescription()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">New Prescription</h2>

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
              <label class="block text-xs font-medium text-body-1 mb-1">Ward / OPD</label>
              <input [(ngModel)]="form.ward" name="ward" placeholder="e.g. GA-02 or OPD"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Prescriber</label>
            <select required [(ngModel)]="form.prescriber" name="prescriber"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="" disabled>Select a doctor</option>
              <option *ngFor="let d of prescribers()" [value]="d.full_name">{{ d.full_name }} — {{ d.department }}</option>
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
            <label class="block text-xs font-medium text-body-1 mb-1">Known allergies</label>
            <input [(ngModel)]="form.allergy" name="allergy" placeholder="e.g. Penicillin — leave blank if none"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-xs font-medium text-body-1">Medicines</label>
              <button type="button" (click)="addItem()" class="text-[11.5px] font-semibold text-brand hover:text-brand-hover">
                + Add line
              </button>
            </div>
            <div *ngFor="let item of form.items; let i = index" class="border border-line-1 rounded-[9px] p-2.5 mb-2 space-y-1.5">
              <div class="flex items-center gap-1.5">
                <input
                  required
                  [(ngModel)]="item.drug"
                  [name]="'drug' + i"
                  list="inventory-names"
                  placeholder="Drug name"
                  class="flex-1 border border-line-1 rounded-[7px] px-2 py-1.5 text-[12.5px] outline-none focus:border-brand"
                />
                <button type="button" *ngIf="form.items.length > 1" (click)="removeItem(i)"
                  class="text-danger-fg text-[12px] px-1.5 flex-none">✕</button>
              </div>
              <div class="grid grid-cols-4 gap-1.5">
                <input [(ngModel)]="item.dose" [name]="'dose' + i" placeholder="Dose"
                  class="border border-line-1 rounded-[7px] px-2 py-1.5 text-[12px] outline-none focus:border-brand" />
                <input [(ngModel)]="item.freq" [name]="'freq' + i" placeholder="Freq"
                  class="border border-line-1 rounded-[7px] px-2 py-1.5 text-[12px] outline-none focus:border-brand" />
                <input [(ngModel)]="item.dur" [name]="'dur' + i" placeholder="Duration"
                  class="border border-line-1 rounded-[7px] px-2 py-1.5 text-[12px] outline-none focus:border-brand" />
                <input type="number" min="1" [(ngModel)]="item.qty" [name]="'qty' + i" placeholder="Qty"
                  class="border border-line-1 rounded-[7px] px-2 py-1.5 text-[12px] outline-none focus:border-brand" />
              </div>
            </div>
            <datalist id="inventory-names">
              <option *ngFor="let inv of inventory.data()" [value]="inv.name"></option>
            </datalist>
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Sending to queue…' : 'Send to pharmacy queue' }}
          </button>
        </form>

        <!-- Inventory snapshot -->
        <div class="xl:col-span-2 bg-white border border-line-1 rounded-card overflow-hidden h-fit">
          <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm flex items-center justify-between">
            <span>Inventory Snapshot</span>
            <span class="text-[11px] font-normal text-muted-1">{{ lowStockCount() }} item(s) at/below reorder level</span>
          </div>
          <div class="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[340px] overflow-y-auto">
            <div *ngIf="!inventory.loading() && inventory.data().length === 0" class="col-span-2 text-center text-body-2 py-4 text-sm">
              No inventory items on file yet.
            </div>
            <div *ngFor="let inv of inventory.data()" class="flex items-center justify-between border border-line-1 rounded-[9px] px-3 py-2"
              [class.border-danger-fg]="isLowStock(inv)">
              <div class="min-w-0">
                <div class="text-[13px] font-medium text-ink-2 truncate">{{ inv.name }}</div>
                <div class="text-[11px] text-muted-1">Reorder at {{ inv.reorder ?? '—' }}</div>
              </div>
              <div class="text-right flex-none">
                <div class="font-mono text-[13px] font-semibold" [class]="isLowStock(inv) ? 'text-danger-fg' : 'text-ink-2'">
                  {{ inv.stock }}
                </div>
                <div class="text-[10px] text-muted-1">in stock</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Dispensing Queue, matching the reference's exact table layout -->
      <div class="bg-white border border-[#e7ecf2] rounded-[14px] overflow-hidden">
        <div class="px-[18px] py-[14px] border-b border-[#eef2f6]">
          <h3 class="m-0 text-[14px] font-semibold text-[#1c3a4d]">Dispensing Queue</h3>
        </div>
        <div class="grid px-[18px] py-[9px] bg-[#f7f9fb] border-b border-[#eef2f6] text-[10.5px] font-semibold tracking-[.4px] text-[#7d92a4] uppercase"
          style="grid-template-columns:88px 1.5fr 50px 84px 104px 100px">
          <span>Rx #</span><span>Patient</span><span>Items</span><span>Priority</span><span>Status</span><span>Action</span>
        </div>
        <div *ngIf="prescriptions.data().length === 0" class="text-center text-body-2 text-sm py-8">No prescriptions in the queue.</div>
        <div *ngFor="let rx of prescriptions.data()" class="grid items-center px-[18px] py-[11px] border-b border-[#f1f4f8] text-[13px]"
          style="grid-template-columns:88px 1.5fr 50px 84px 104px 100px">
          <span class="font-mono font-semibold text-[12px] text-[#6b4bd6]">{{ rxNumber(rx.id) }}</span>
          <div class="min-w-0">
            <div class="font-medium text-[#22384a] truncate">{{ rx.patient }}</div>
            <div class="text-[11px] text-[#8094a6] truncate">{{ rx.prescriber }}</div>
          </div>
          <span class="font-mono text-[12px] text-[#6b8196]">{{ rx.items?.length ?? 0 }}</span>
          <span>
            <span class="inline-block px-[9px] py-0.5 rounded-pill text-[10.5px] font-semibold"
              [style.background]="priorityColor(rx.priority).bg" [style.color]="priorityColor(rx.priority).fg">
              {{ rx.priority }}
            </span>
          </span>
          <span><app-status-badge [status]="rx.status"></app-status-badge></span>
          <span>
            <button *ngIf="nextStatus(rx.status)" (click)="advance(rx)"
              class="bg-[#f0ecfb] text-[#6b4bd6] border border-[#d9d0f6] rounded-[7px] px-[10px] py-[5px] text-[11.5px] font-semibold hover:bg-[#e6def8]">
              {{ rx.status === 'Ready' ? 'Dispense…' : nextStatus(rx.status) }}
            </button>
            <span *ngIf="rx.status === 'Dispensed'" class="text-[11.5px] text-[#1d9a57] font-semibold">✓ Done</span>
          </span>
        </div>
      </div>
    </div>
  `,
})
export class PharmacyComponent implements OnDestroy {
  form: RxForm = emptyForm();
  submitting = false;
  errorMsg = '';

  prescriptions: RealtimeTableHandle<any>;
  inventory: RealtimeTableHandle<any>;
  doctors: RealtimeTableHandle<Doctor>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.prescriptions = this.realtime.watch('prescriptions', (q) => q.order('created_at', { ascending: false }));
    this.inventory = this.realtime.watch('inventory_items', (q) => q.order('name'));
    this.doctors = this.realtime.watch<Doctor>('doctors', (q) => q.eq('active', true).order('full_name'));
  }

  prescribers(): Doctor[] {
    return rosterFor(this.doctors.data());
  }

  priorityColor = priorityColor;

  // Short, stable "Rx #" derived from the row's uuid -- the reference has a
  // real sequential prescription number, which we don't generate; this is
  // the closest honest equivalent using data that actually exists.
  rxNumber(id: string) {
    return 'RX-' + id.slice(0, 4).toUpperCase();
  }

  nextStatus(status: string) {
    return NEXT_STATUS[status];
  }

  // Matches the reference's Pharmacy KPI row (In Queue / Dispensed Today /
  // Low Stock / Expiring Soon). "Expiring Soon" in the reference tracks
  // batch expiry dates, which our simplified inventory model doesn't
  // capture -- replaced with a real STAT-priority queue count instead of
  // fabricating expiry data.
  kpis(): KpiItem[] {
    const rx = this.prescriptions.data();
    const todayStart = new Date().toISOString().slice(0, 10);
    const dispensedToday = rx.filter((r: any) => r.status === 'Dispensed' && (r.dispensed_at ?? '').slice(0, 10) === todayStart);
    return [
      { label: 'In Queue', value: String(rx.filter((r: any) => r.status !== 'Dispensed').length), icon: 'ph-stack', tintKey: 'blue' },
      { label: 'Dispensed Today', value: String(dispensedToday.length), icon: 'ph-check-circle', tintKey: 'green' },
      { label: 'Low Stock', value: String(this.inventory.data().filter((i: any) => i.reorder != null && i.stock <= i.reorder).length), icon: 'ph-trend-down', tintKey: 'amber' },
      { label: 'STAT Orders', value: String(rx.filter((r: any) => r.priority === 'STAT' && r.status !== 'Dispensed').length), icon: 'ph-lightning', tintKey: 'red' },
    ];
  }

  isLowStock(inv: any) {
    return inv.reorder != null && inv.stock <= inv.reorder;
  }

  lowStockCount() {
    return this.inventory.data().filter((i: any) => this.isLowStock(i)).length;
  }

  addItem() {
    this.form.items.push(emptyItem());
  }

  removeItem(i: number) {
    this.form.items.splice(i, 1);
  }

  async createPrescription() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('prescriptions').insert({
        patient: this.form.patient,
        mrn: this.form.mrn,
        prescriber: this.form.prescriber,
        ward: this.form.ward,
        priority: this.form.priority,
        allergy: this.form.allergy,
        status: 'Queued',
        items: this.form.items.filter((i) => i.drug.trim() !== ''),
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.prescriptions.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  // Advancing to Dispensed also decrements matching inventory stock
  // (best-effort name match; items with no matching inventory row are
  // simply skipped rather than blocking the dispense).
  async advance(rx: any) {
    const next = NEXT_STATUS[rx.status];
    if (!next) return;
    const client = this.supabaseService.client;

    if (next === 'Dispensed') {
      for (const item of rx.items ?? []) {
        const match = this.inventory.data().find(
          (inv: any) => inv.name.toLowerCase() === (item.drug ?? '').toLowerCase()
        );
        if (match) {
          const newStock = Math.max(0, match.stock - Number(item.qty || 1));
          await client.from('inventory_items').update({ stock: newStock }).eq('id', match.id);
        }
      }
    }

    const patch: any = { status: next };
    if (next === 'Dispensed') patch.dispensed_at = new Date().toISOString();

    const { error } = await client.from('prescriptions').update(patch).eq('id', rx.id);
    if (error) console.error(error);
  }

  ngOnDestroy() {
    this.prescriptions.dispose();
    this.inventory.dispose();
    this.doctors.dispose();
  }
}
