import { Component, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

const NEXT_STATUS: Record<string, string> = {
  Waiting: 'Called',
  Called: 'In Consultation',
  'In Consultation': 'Completed',
};

const COLUMNS = ['Waiting', 'Called', 'In Consultation', 'Completed'];

function minutesSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

@Component({
  selector: 'app-opd',
  standalone: true,
  imports: [CommonModule, StatusBadgeComponent, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>

      <div *ngIf="visits.loading()" class="text-body-2">Loading…</div>

      <div *ngIf="!visits.loading()" class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div *ngFor="let col of columns" class="bg-white border border-line-1 rounded-card overflow-hidden">
          <div class="px-4 py-3 border-b border-line-1 flex items-center justify-between">
            <span class="font-semibold text-ink-2 text-sm">{{ col }}</span>
            <span class="text-[11.5px] text-muted-1">{{ itemsFor(col).length }}</span>
          </div>
          <div class="p-3 space-y-2 min-h-[120px]">
            <div *ngIf="itemsFor(col).length === 0" class="text-[12.5px] text-muted-2 text-center py-6">
              Nothing here
            </div>
            <div *ngFor="let v of itemsFor(col)" class="border border-line-1 rounded-[10px] p-3">
              <div class="flex items-center justify-between mb-1">
                <span class="font-mono text-[12px] font-semibold text-body-1">{{ v.token }}</span>
                <span class="text-[11px] text-muted-1">{{ v.in_time }}</span>
              </div>
              <div class="font-medium text-ink-2 text-sm">{{ v.name }}</div>
              <div class="text-[11.5px] text-muted-1 mb-2">{{ v.dept }} · {{ v.doctor }}</div>
              <button
                *ngIf="nextStatus(v.status)"
                (click)="advance(v)"
                class="w-full text-[12px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5"
              >
                Move to {{ nextStatus(v.status) }}
              </button>
              <app-status-badge *ngIf="v.status === 'Completed'" status="Completed"></app-status-badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class OpdComponent implements OnDestroy {
  columns = COLUMNS;
  visits: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.visits = this.realtime.watch('opd_visits', (q) => q.order('in_time', { ascending: true }));
  }

  itemsFor(col: string) {
    return this.visits.data().filter((v: any) => v.status === col);
  }

  nextStatus(status: string) {
    return NEXT_STATUS[status];
  }

  // Matches the reference's OPD KPI row (Active Visits / Avg Consultation /
  // Avg Wait / Completed Today) with real data. "Avg Consultation" in the
  // reference is a static fake number (we don't track consult start/end
  // timestamps) -- replaced with a real "Called" count instead of inventing
  // a duration.
  kpis(): KpiItem[] {
    const all = this.visits.data();
    const waiting = all.filter((v: any) => v.status === 'Waiting');
    const avgWaitMin = waiting.length
      ? Math.round(waiting.reduce((sum: number, v: any) => sum + minutesSince(v.created_at), 0) / waiting.length)
      : 0;
    const todayStart = new Date().toISOString().slice(0, 10);
    const completedToday = all.filter((v: any) => v.status === 'Completed' && (v.created_at ?? '').slice(0, 10) === todayStart);

    return [
      { label: 'Active Visits', value: String(all.filter((v: any) => v.status !== 'Completed').length), icon: 'ph-users', tintKey: 'teal' },
      { label: 'Called', value: String(all.filter((v: any) => v.status === 'Called').length), icon: 'ph-megaphone', tintKey: 'blue' },
      { label: 'Avg Wait', value: waiting.length ? avgWaitMin + 'm' : '—', icon: 'ph-hourglass-medium', tintKey: 'amber' },
      { label: 'Completed Today', value: String(completedToday.length), icon: 'ph-check-circle', tintKey: 'green' },
    ];
  }

  async advance(visit: any) {
    const next = NEXT_STATUS[visit.status];
    if (!next) return;
    const client = this.supabaseService.client;
    const { error } = await client.from('opd_visits').update({ status: next }).eq('id', visit.id);
    if (error) console.error(error);

    if (visit.patient_id) {
      await client.from('patients').update({ status: `OPD · ${next}` }).eq('id', visit.patient_id);
    }
  }

  ngOnDestroy() {
    this.visits.dispose();
  }
}
