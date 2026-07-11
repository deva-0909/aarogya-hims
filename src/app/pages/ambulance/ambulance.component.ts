import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

const STAGES = ['Assigned', 'En Route', 'On Scene', 'Transporting', 'At Hospital', 'Completed'];
const NEXT_STAGE: Record<string, string> = {
  Assigned: 'En Route',
  'En Route': 'On Scene',
  'On Scene': 'Transporting',
  Transporting: 'At Hospital',
  'At Hospital': 'Completed',
};
const PRIORITY_STYLE: Record<string, string> = {
  Routine: 'bg-line-2 text-body-1',
  Urgent: 'bg-warning-bg text-warning-fg',
  Emergency: 'bg-danger-bg text-danger-fg',
};

interface TripForm {
  vehicle: string; patient: string; priority: string; pickup: string; destination: string; reason: string; mlc: boolean;
}
const emptyForm = (): TripForm => ({ vehicle: '', patient: '', priority: 'Routine', pickup: '', destination: '', reason: '', mlc: false });

@Component({
  selector: 'app-ambulance',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>


      <div class="grid grid-cols-1 xl:grid-cols-4 gap-5 mb-6">
        <form (ngSubmit)="createTrip()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">Dispatch</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Vehicle</label>
            <input required [(ngModel)]="form.vehicle" name="vehicle" placeholder="e.g. AMB-02"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Patient</label>
            <input required [(ngModel)]="form.patient" name="patient"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Priority</label>
            <select [(ngModel)]="form.priority" name="priority"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="Routine">Routine</option>
              <option value="Urgent">Urgent</option>
              <option value="Emergency">Emergency</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Pickup location</label>
            <input required [(ngModel)]="form.pickup" name="pickup"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Destination</label>
            <input required [(ngModel)]="form.destination" name="destination" placeholder="e.g. City General ED"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Reason</label>
            <input [(ngModel)]="form.reason" name="reason"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <label class="flex items-center gap-2 text-sm text-body-1">
            <input type="checkbox" [(ngModel)]="form.mlc" name="mlc" class="rounded" />
            Medico-legal case (MLC)
          </label>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Dispatching…' : 'Dispatch' }}
          </button>
        </form>

        <div class="xl:col-span-3 overflow-x-auto">
          <div class="flex gap-3 min-w-[900px]">
            <div *ngFor="let col of stages" class="bg-white border border-line-1 rounded-card overflow-hidden flex-1 min-w-[150px]">
              <div class="px-3 py-2.5 border-b border-line-1 flex items-center justify-between">
                <span class="font-semibold text-ink-2 text-[12px]">{{ col }}</span>
                <span class="text-[11px] text-muted-1">{{ itemsFor(col).length }}</span>
              </div>
              <div class="p-2.5 space-y-2 min-h-[100px]">
                <div *ngIf="itemsFor(col).length === 0" class="text-[11.5px] text-muted-2 text-center py-5">—</div>
                <div *ngFor="let t of itemsFor(col)" class="border border-line-1 rounded-[9px] p-2.5">
                  <div class="flex items-center justify-between mb-0.5">
                    <span class="font-mono text-[11.5px] font-semibold text-body-1">{{ t.vehicle }}</span>
                    <span class="px-1.5 py-0.5 rounded-pill text-[10px] font-medium" [class]="priorityStyle(t.priority)">{{ t.priority }}</span>
                  </div>
                  <div class="text-[11.5px] font-medium text-ink-2 mb-1">{{ t.patient }}</div>
                  <div class="text-[10.5px] text-muted-1 mb-2">{{ t.pickup }} → {{ t.destination }}</div>
                  <div *ngIf="t.mlc" class="text-[10px] font-semibold text-warning-fg mb-1.5">MLC</div>
                  <button *ngIf="nextStage(t.stage)" (click)="advance(t)"
                    class="w-full text-[11px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5">
                    → {{ nextStage(t.stage) }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AmbulanceComponent implements OnDestroy {
  stages = STAGES;
  form: TripForm = emptyForm();
  submitting = false;
  errorMsg = '';

  trips: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.trips = this.realtime.watch('ambulance_trips', (q) => q.order('created_at', { ascending: false }));
  }

  // The reference's "Fleet Available"/"Avg Response"/"On-time Rate" assume
  // a tracked vehicle fleet and response-time timestamps we don't model
  // (trips reference a vehicle by free text, not a fleet roster) --
  // replaced with real metrics from actual trip data instead.
  kpis(): KpiItem[] {
    const all = this.trips.data();
    const todayStart = new Date().toISOString().slice(0, 10);
    const completedToday = all.filter((t: any) => t.stage === 'Completed' && (t.created_at ?? '').slice(0, 10) === todayStart);
    return [
      { label: 'Active Trips', value: String(all.filter((t: any) => t.stage !== 'Completed').length), icon: 'ph-ambulance', tintKey: 'blue' },
      { label: 'Emergency Priority', value: String(all.filter((t: any) => t.priority === 'Emergency' && t.stage !== 'Completed').length), icon: 'ph-siren', tintKey: 'red' },
      { label: 'MLC Trips', value: String(all.filter((t: any) => t.mlc).length), icon: 'ph-scales', tintKey: 'amber' },
      { label: 'Completed Today', value: String(completedToday.length), icon: 'ph-check-circle', tintKey: 'green' },
    ];
  }

  itemsFor(stage: string) {
    return this.trips.data().filter((t: any) => (t.stage ?? 'Assigned') === stage);
  }

  nextStage(stage: string) {
    return NEXT_STAGE[stage ?? 'Assigned'];
  }

  priorityStyle(priority: string) {
    return PRIORITY_STYLE[priority] ?? PRIORITY_STYLE['Routine'];
  }

  async createTrip() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('ambulance_trips').insert({
        vehicle: this.form.vehicle,
        patient: this.form.patient,
        priority: this.form.priority,
        pickup: this.form.pickup,
        destination: this.form.destination,
        reason: this.form.reason,
        mlc: this.form.mlc,
        stage: 'Assigned',
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.trips.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async advance(trip: any) {
    const next = NEXT_STAGE[trip.stage ?? 'Assigned'];
    if (!next) return;
    const { error } = await this.supabaseService.client.from('ambulance_trips').update({ stage: next }).eq('id', trip.id);
    if (error) console.error(error);
  }

  ngOnDestroy() {
    this.trips.dispose();
  }
}
