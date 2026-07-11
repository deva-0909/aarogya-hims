import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';

interface Kpi {
  label: string;
  value: () => number;
  icon: string;
  route: string;
  tone: 'default' | 'warning' | 'danger';
}

@Component({
  selector: 'app-command-center',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div>
      <p class="text-[12.5px] text-muted-1 mb-5">Live snapshot across every module — click a card to jump straight there.</p>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <a *ngFor="let k of kpis" [routerLink]="['/', k.route]"
          class="bg-white border rounded-card p-4 hover:shadow-sm transition-shadow"
          [class]="k.tone === 'danger' && k.value() > 0 ? 'border-danger-fg' : k.tone === 'warning' && k.value() > 0 ? 'border-warning-fg' : 'border-line-1'">
          <div class="flex items-center justify-between mb-2">
            <i class="ph {{ k.icon }} text-[20px]"
              [class]="k.tone === 'danger' && k.value() > 0 ? 'text-danger-fg' : k.tone === 'warning' && k.value() > 0 ? 'text-warning-fg' : 'text-brand'"></i>
          </div>
          <div class="text-[26px] font-bold text-ink-1 font-mono leading-none mb-1">{{ k.value() }}</div>
          <div class="text-[11.5px] text-body-1 leading-snug">{{ k.label }}</div>
        </a>
      </div>

      <div class="mt-6 bg-white border border-line-1 rounded-card p-5">
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

  private opdVisits: RealtimeTableHandle<any>;
  private beds: RealtimeTableHandle<any>;
  private icuBeds: RealtimeTableHandle<any>;
  private edVisits: RealtimeTableHandle<any>;
  private prescriptions: RealtimeTableHandle<any>;
  private labOrders: RealtimeTableHandle<any>;
  private radiologyOrders: RealtimeTableHandle<any>;
  private bloodInventory: RealtimeTableHandle<any>;
  private inventoryItems: RealtimeTableHandle<any>;
  private purchaseRequisitions: RealtimeTableHandle<any>;
  private insuranceClaims: RealtimeTableHandle<any>;
  private itTickets: RealtimeTableHandle<any>;
  private ambulanceTrips: RealtimeTableHandle<any>;
  private housekeepingTasks: RealtimeTableHandle<any>;
  private leaveRequests: RealtimeTableHandle<any>;

  kpis: Kpi[];

  constructor(private realtime: RealtimeTableService) {
    this.opdVisits = this.watch('opd_visits');
    this.beds = this.watch('beds');
    this.icuBeds = this.watch('icu_beds');
    this.edVisits = this.watch('ed_visits');
    this.prescriptions = this.watch('prescriptions');
    this.labOrders = this.watch('lab_orders');
    this.radiologyOrders = this.watch('radiology_orders');
    this.bloodInventory = this.watch('blood_inventory');
    this.inventoryItems = this.watch('inventory_items');
    this.purchaseRequisitions = this.watch('purchase_requisitions');
    this.insuranceClaims = this.watch('insurance_claims');
    this.itTickets = this.watch('it_tickets');
    this.ambulanceTrips = this.watch('ambulance_trips');
    this.housekeepingTasks = this.watch('housekeeping_tasks');
    this.leaveRequests = this.watch('leave_requests');

    this.kpis = [
      { label: 'Patients waiting in OPD', icon: 'ph-stethoscope', route: 'opd', tone: 'default',
        value: () => this.opdVisits.data().filter((v) => v.status === 'Waiting').length },
      { label: 'IPD beds occupied', icon: 'ph-bed', route: 'ipd', tone: 'default',
        value: () => this.beds.data().filter((b) => b.status === 'occupied').length },
      { label: 'ICU beds occupied', icon: 'ph-heartbeat', route: 'icu', tone: 'warning',
        value: () => this.icuBeds.data().filter((b) => b.status === 'occupied').length },
      { label: 'Active ED patients', icon: 'ph-first-aid-kit', route: 'emergency', tone: 'danger',
        value: () => this.edVisits.data().filter((v) => v.status !== 'Closed').length },
      { label: 'Pending prescriptions', icon: 'ph-pill', route: 'pharmacy', tone: 'default',
        value: () => this.prescriptions.data().filter((p) => p.status !== 'Dispensed').length },
      { label: 'Pending lab orders', icon: 'ph-flask', route: 'laboratory', tone: 'default',
        value: () => this.labOrders.data().filter((o) => o.stage !== 'Validated').length },
      { label: 'Pending imaging orders', icon: 'ph-scan', route: 'radiology', tone: 'default',
        value: () => this.radiologyOrders.data().filter((o) => o.stage !== 'Verified').length },
      { label: 'Blood units below threshold', icon: 'ph-drop', route: 'blood-bank', tone: 'danger',
        value: () => this.bloodInventory.data().filter((b) => b.min_threshold != null && b.units <= b.min_threshold).length },
      { label: 'Inventory items low stock', icon: 'ph-package', route: 'inventory', tone: 'warning',
        value: () => this.inventoryItems.data().filter((i) => i.reorder != null && i.stock <= i.reorder).length },
      { label: 'Purchase requisitions pending', icon: 'ph-shopping-cart-simple', route: 'purchase', tone: 'default',
        value: () => this.purchaseRequisitions.data().filter((r) => r.stage !== 'Received').length },
      { label: 'Insurance claims in progress', icon: 'ph-shield-check', route: 'insurance', tone: 'default',
        value: () => this.insuranceClaims.data().filter((c) => c.stage !== 'Settled').length },
      { label: 'Open IT tickets', icon: 'ph-desktop-tower', route: 'it-support', tone: 'default',
        value: () => this.itTickets.data().filter((t) => t.status !== 'Closed').length },
      { label: 'Active ambulance trips', icon: 'ph-ambulance', route: 'ambulance', tone: 'default',
        value: () => this.ambulanceTrips.data().filter((t) => t.stage !== 'Completed').length },
      { label: 'Housekeeping tasks pending', icon: 'ph-broom', route: 'housekeeping', tone: 'default',
        value: () => this.housekeepingTasks.data().filter((t) => t.status !== 'Completed').length },
      { label: 'Leave requests pending', icon: 'ph-users-three', route: 'hr', tone: 'default',
        value: () => this.leaveRequests.data().filter((l) => l.status === 'Pending').length },
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
