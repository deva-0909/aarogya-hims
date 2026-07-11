import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { Doctor, rosterFor } from '../../core/doctors';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

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

const PRIORITY_STYLE: Record<string, string> = {
  Routine: 'bg-line-2 text-body-1',
  Urgent: 'bg-warning-bg text-warning-fg',
  STAT: 'bg-danger-bg text-danger-fg',
};

function emptyItem(): RxItem {
  return { drug: '', dose: '', freq: '', dur: '', qty: 1 };
}
function emptyForm(): RxForm {
  return { patient: '', mrn: '', prescriber: '', ward: '', priority: 'Routine', allergy: '', items: [emptyItem()] };
}

@Component({
  selector: 'app-pharmacy',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent],
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

      <!-- Queue board -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div *ngFor="let col of columns" class="bg-white border border-line-1 rounded-card overflow-hidden">
          <div class="px-4 py-3 border-b border-line-1 flex items-center justify-between">
            <span class="font-semibold text-ink-2 text-sm">{{ col }}</span>
            <span class="text-[11.5px] text-muted-1">{{ itemsFor(col).length }}</span>
          </div>
          <div class="p-3 space-y-2 min-h-[120px]">
            <div *ngIf="itemsFor(col).length === 0" class="text-[12.5px] text-muted-2 text-center py-6">Nothing here</div>
            <div *ngFor="let rx of itemsFor(col)" class="border border-line-1 rounded-[10px] p-3">
              <div class="flex items-center justify-between mb-1">
                <span class="font-medium text-ink-2 text-sm">{{ rx.patient }}</span>
                <span class="px-2 py-0.5 rounded-pill text-[10.5px] font-medium" [class]="priorityStyle(rx.priority)">{{ rx.priority }}</span>
              </div>
              <div class="text-[11.5px] text-muted-1 mb-1">{{ rx.mrn || '—' }} · {{ rx.ward || '—' }} · {{ rx.prescriber }}</div>
              <div class="text-[11.5px] text-body-1 mb-2">{{ rx.items?.length ?? 0 }} item(s){{ rx.allergy ? ' · Allergy: ' + rx.allergy : '' }}</div>
              <button *ngIf="nextStatus(rx.status)" (click)="advance(rx)"
                class="w-full text-[12px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5">
                Move to {{ nextStatus(rx.status) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PharmacyComponent implements OnDestroy {
  columns = STATUS_FLOW;
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

  itemsFor(col: string) {
    return this.prescriptions.data().filter((rx: any) => rx.status === col);
  }

  nextStatus(status: string) {
    return NEXT_STATUS[status];
  }

  priorityStyle(priority: string) {
    return PRIORITY_STYLE[priority] ?? PRIORITY_STYLE['Routine'];
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
