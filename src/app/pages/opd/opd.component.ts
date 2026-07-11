import { Component, OnDestroy } from '@angular/core';
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

const OPD_SEQUENCE = ['Waiting', 'Called', 'In Consultation', 'Completed'];

// Exact status dot colors from the reference prototype's PILL map
// (opdCounts uses `pill(status).fg` for its dot color).
const STATUS_DOT: Record<string, string> = {
  Waiting: '#97600a',
  Called: '#2257a3',
  'In Consultation': '#0a6a60',
  Completed: '#1d7a42',
};

function minutesSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

function fmtWait(iso: string | null | undefined): string {
  const m = Math.round(minutesSince(iso));
  return m + 'm';
}

@Component({
  selector: 'app-opd',
  standalone: true,
  imports: [CommonModule, StatusBadgeComponent, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>

      <div *ngIf="visits.loading()" class="text-body-2">Loading…</div>

      <!-- Live consultation queue table + queue-by-status panel, matching the reference layout exactly -->
      <div *ngIf="!visits.loading()" class="grid gap-[18px] items-start" style="grid-template-columns:1.8fr 1fr">
        <div class="bg-white border border-[#e7ecf2] rounded-[14px] overflow-hidden">
          <div class="px-[18px] py-[14px] border-b border-[#eef2f6] flex items-center justify-between">
            <h3 class="m-0 text-[14px] font-semibold text-[#1c3a4d]">Live Consultation Queue</h3>
            <span class="text-[11.5px] text-[#9aabbb]">{{ activeVisits().length }} in queue</span>
          </div>
          <div class="grid px-[18px] py-[9px] bg-[#f7f9fb] border-b border-[#eef2f6] text-[10.5px] font-semibold tracking-[.4px] text-[#7d92a4] uppercase"
            style="grid-template-columns:74px 1.4fr 1.2fr 1fr 56px 56px 116px">
            <span>Token</span><span>Patient</span><span>Department</span><span>Doctor</span><span>In</span><span>Wait</span><span>Action</span>
          </div>
          <div *ngIf="activeVisits().length === 0" class="text-center text-body-2 text-sm py-8">No patients currently in the OPD queue.</div>
          <div *ngFor="let v of activeVisits()" class="grid items-center px-[18px] py-[10px] border-b border-[#f1f4f8] text-[13px]"
            style="grid-template-columns:74px 1.4fr 1.2fr 1fr 56px 56px 116px">
            <span class="font-mono font-semibold text-[12px] text-brand">{{ v.token }}</span>
            <div class="min-w-0">
              <div class="font-medium text-[#22384a] truncate">{{ v.name }}</div>
              <app-status-badge [status]="v.status"></app-status-badge>
            </div>
            <span class="text-[#3f566a] truncate">{{ v.dept }}</span>
            <span class="text-[#5f7689] truncate">{{ v.doctor }}</span>
            <span class="font-mono text-[12px] text-[#6b8196]">{{ v.in_time }}</span>
            <span class="font-mono text-[12px] text-[#6b8196]">{{ fmtWait(v.created_at) }}</span>
            <span>
              <button
                *ngIf="nextStatus(v.status)"
                (click)="advance(v)"
                class="bg-[#eaf5f3] text-[#0a6a60] border border-[#c9e7e2] rounded-[7px] px-[11px] py-[5px] text-[12px] font-semibold hover:bg-[#dff0ed]"
              >
                {{ nextStatus(v.status) }}
              </button>
            </span>
          </div>
        </div>

        <div class="bg-white border border-[#e7ecf2] rounded-[14px] p-[16px_18px]">
          <h3 class="m-0 mb-3 text-[14px] font-semibold text-[#1c3a4d]">Queue by Status</h3>
          <div *ngFor="let s of statusCounts()" class="flex items-center gap-[11px] py-[10px] border-b border-[#f0f3f7] last:border-0">
            <span class="w-[10px] h-[10px] rounded-full flex-none" [style.background]="s.dot"></span>
            <span class="flex-1 text-[13px] text-[#3f566a]">{{ s.label }}</span>
            <span class="font-mono font-semibold text-[16px] text-[#12303f]">{{ s.n }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class OpdComponent implements OnDestroy {
  visits: RealtimeTableHandle<any>;
  fmtWait = fmtWait;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.visits = this.realtime.watch('opd_visits', (q) => q.order('in_time', { ascending: true }));
  }

  activeVisits() {
    return this.visits.data().filter((v: any) => v.status !== 'Completed');
  }

  statusCounts() {
    const all = this.visits.data();
    return OPD_SEQUENCE.map((label) => ({
      label,
      n: all.filter((v: any) => v.status === label).length,
      dot: STATUS_DOT[label],
    }));
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
