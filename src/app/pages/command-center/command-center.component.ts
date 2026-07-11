import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { TINT } from '../../core/tint';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

interface FeaturedKpiSource {
  label: string;
  value: () => string;
  icon: string;
  tintKey: string;
}

interface Counter {
  label: string;
  icon: string;
  value: () => number;
  route: string;
  tint: string;
}

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function formatMoney(rupees: number): string {
  if (rupees >= 100000) return '\u20b9' + (rupees / 100000).toFixed(1) + 'L';
  if (rupees >= 1000) return '\u20b9' + (rupees / 1000).toFixed(1) + 'K';
  return '\u20b9' + rupees.toFixed(0);
}

@Component({
  selector: 'app-command-center',
  standalone: true,
  imports: [CommonModule, RouterLink, KpiRowComponent],
  template: `
    <div>
      <p class="text-[12.5px] text-muted-1 mb-5">Live snapshot across every module — click a card to jump straight there.</p>

      <app-kpi-row [items]="featuredKpiItems()"></app-kpi-row>

      <!-- Department counters row, matching the reference layout/colors exactly -->
      <div class="grid gap-3 mb-[18px]" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        <a *ngFor="let c of counters" [routerLink]="['/', c.route]"
          class="bg-white border border-[#e7ecf2] rounded-[13px] p-[13px_15px] flex items-center gap-3 hover:shadow-sm transition-shadow">
          <span class="w-10 h-10 rounded-[11px] flex items-center justify-center flex-none" [style.background]="TINT[c.tint].bg">
            <i class="ph {{ c.icon }} text-[21px]" [style.color]="TINT[c.tint].fg"></i>
          </span>
          <div class="min-w-0">
            <div class="font-mono font-semibold text-[22px] text-[#12303f] leading-none">{{ c.value() }}</div>
            <div class="text-[11.5px] text-[#7d92a4] mt-[3px]">{{ c.label }} · live</div>
          </div>
        </a>
      </div>

      <div class="bg-white border border-line-1 rounded-card p-5">
        <h2 class="font-semibold text-ink-2 text-sm mb-2">About this view</h2>
        <p class="text-[12.5px] text-body-1 leading-relaxed">
          Every number above is live — pulled directly from the same Supabase tables each module reads and
          writes. There's no separate reporting pipeline or nightly batch job; register a patient in Front
          Office or move a prescription to Dispensed in Pharmacy and the relevant card here updates within
          a couple of seconds via Supabase Realtime.
        </p>
      </div>
    </div>
  `,
})
export class CommandCenterComponent implements OnDestroy {
  private handles: RealtimeTableHandle<any>[] = [];
  TINT = TINT;

  private opdVisits: RealtimeTableHandle<any>;
  private beds: RealtimeTableHandle<any>;
  private admissions: RealtimeTableHandle<any>;
  private edVisits: RealtimeTableHandle<any>;
  private payments: RealtimeTableHandle<any>;
  private prescriptions: RealtimeTableHandle<any>;
  private labOrders: RealtimeTableHandle<any>;
  private radiologyOrders: RealtimeTableHandle<any>;
  private bloodInventory: RealtimeTableHandle<any>;
  private ambulanceTrips: RealtimeTableHandle<any>;

  private featuredKpisSource: FeaturedKpiSource[];
  counters: Counter[];

  featuredKpiItems(): KpiItem[] {
    return this.featuredKpisSource.map((k) => ({ label: k.label, value: k.value(), icon: k.icon, tintKey: k.tintKey }));
  }

  constructor(private realtime: RealtimeTableService) {
    this.opdVisits = this.watch('opd_visits');
    this.beds = this.watch('beds');
    this.admissions = this.watch('admissions');
    this.edVisits = this.watch('ed_visits');
    this.payments = this.watch('payments');
    this.prescriptions = this.watch('prescriptions');
    this.labOrders = this.watch('lab_orders');
    this.radiologyOrders = this.watch('radiology_orders');
    this.bloodInventory = this.watch('blood_inventory');
    this.ambulanceTrips = this.watch('ambulance_trips');

    // Matches the reference's 6-card featured row exactly (Bed Occupancy,
    // Admissions Today, OPD Visits, ED Avg Wait, Revenue Today, Discharges)
    // -- all computed from real data. No fabricated trend deltas (the
    // reference shows "+3%" style deltas versus a prior period we don't
    // track) -- shown as plain current values instead of inventing a
    // comparison.
    this.featuredKpisSource = [
      {
        label: 'Bed Occupancy', icon: 'ph-bed', tintKey: 'teal',
        value: () => {
          const all = this.beds.data();
          if (all.length === 0) return '—';
          const occ = all.filter((b: any) => b.status === 'occupied').length;
          return Math.round((occ / all.length) * 100) + '%';
        },
      },
      {
        label: 'Admissions Today', icon: 'ph-sign-in', tintKey: 'blue',
        value: () => String(this.admissions.data().filter((a: any) => isToday(a.admitted_at)).length),
      },
      {
        label: 'OPD Visits Today', icon: 'ph-stethoscope', tintKey: 'indigo',
        value: () => String(this.opdVisits.data().filter((v: any) => isToday(v.created_at)).length),
      },
      {
        label: 'ED Avg Wait', icon: 'ph-timer', tintKey: 'amber',
        value: () => {
          const active = this.edVisits.data().filter((v: any) => v.status !== 'Closed' && v.created_at);
          if (active.length === 0) return '—';
          const totalMin = active.reduce((sum: number, v: any) => sum + (Date.now() - new Date(v.created_at).getTime()) / 60000, 0);
          return Math.round(totalMin / active.length) + 'm';
        },
      },
      {
        label: 'Revenue Today', icon: 'ph-currency-circle-dollar', tintKey: 'green',
        value: () => formatMoney(
          this.payments.data().filter((p: any) => isToday(p.created_at)).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)
        ),
      },
      {
        label: 'Discharges Today', icon: 'ph-sign-out', tintKey: 'slate',
        value: () => String(this.admissions.data().filter((a: any) => isToday(a.discharged_at)).length),
      },
    ];

    // Matches the reference's 8-tile department counter row, same colors
    // and icons, wired to real live counts instead of static demo numbers.
    this.counters = [
      { label: 'OPD', icon: 'ph-stethoscope', route: 'opd', tint: 'teal',
        value: () => this.opdVisits.data().filter((v: any) => isToday(v.created_at)).length },
      { label: 'IPD', icon: 'ph-bed', route: 'ipd', tint: 'blue',
        value: () => this.beds.data().filter((b: any) => b.status === 'occupied').length },
      { label: 'Emergency', icon: 'ph-first-aid-kit', route: 'emergency', tint: 'red',
        value: () => this.edVisits.data().filter((v: any) => v.status !== 'Closed').length },
      { label: 'Pharmacy', icon: 'ph-pill', route: 'pharmacy', tint: 'indigo',
        value: () => this.prescriptions.data().filter((p: any) => p.status !== 'Dispensed').length },
      { label: 'Laboratory', icon: 'ph-flask', route: 'laboratory', tint: 'amber',
        value: () => this.labOrders.data().filter((o: any) => o.stage !== 'Validated').length },
      { label: 'Radiology', icon: 'ph-scan', route: 'radiology', tint: 'cyan',
        value: () => this.radiologyOrders.data().filter((o: any) => o.stage !== 'Verified').length },
      { label: 'Blood Bank', icon: 'ph-drop', route: 'blood-bank', tint: 'magenta',
        value: () => this.bloodInventory.data().reduce((sum: number, b: any) => sum + Number(b.units || 0), 0) },
      { label: 'Ambulance', icon: 'ph-ambulance', route: 'ambulance', tint: 'green',
        value: () => this.ambulanceTrips.data().filter((t: any) => t.stage !== 'Completed').length },
    ];
  }

  private watch(table: string): RealtimeTableHandle<any> {
    const handle = this.realtime.watch(table);
    this.handles.push(handle);
    return handle;
  }

  ngOnDestroy() {
    this.handles.forEach((h) => h.dispose());
  }
}
