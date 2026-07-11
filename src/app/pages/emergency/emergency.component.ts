import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { Doctor, rosterFor } from '../../core/doctors';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

const TRIAGE_LEVELS: { value: string; label: string }[] = [
  { value: 'red', label: 'Red — Immediate' },
  { value: 'yellow', label: 'Yellow — Urgent' },
  { value: 'green', label: 'Green — Non-urgent' },
];

// Exact TRI color/label map from the reference prototype (bg, fg, dot, pill label).
const TRI: Record<string, { bg: string; fg: string; dot: string; label: string }> = {
  red: { bg: '#fbe3e3', fg: '#b42318', dot: '#e5484d', label: 'Critical' },
  yellow: { bg: '#fdf3d6', fg: '#95600a', dot: '#e3a008', label: 'Urgent' },
  green: { bg: '#ddf1e3', fg: '#1d7a42', dot: '#2f9e60', label: 'Stable' },
};
const TRIAGE_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2 };

function fmtWait(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m + 'm';
}

const STAGES = ['Triage', 'In Treatment', 'Disposition Pending', 'Closed'];
const NEXT_STAGE: Record<string, string> = {
  Triage: 'In Treatment',
  'In Treatment': 'Disposition Pending',
  'Disposition Pending': 'Closed',
};

const DISPOSITIONS = ['Admit', 'Discharge', 'Refer', 'Observation', 'LAMA', 'Death'];

interface VisitForm {
  patient: string; age: string; sex: string; complaint: string; triage: string;
  hr: string; bp: string; spo2: string; temp: string; doctor: string; mlc: boolean;
}
const emptyForm = (): VisitForm => ({
  patient: '', age: '', sex: 'M', complaint: '', triage: 'yellow',
  hr: '', bp: '', spo2: '', temp: '', doctor: '', mlc: false,
});

@Component({
  selector: 'app-emergency',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>

      <div class="grid grid-cols-1 xl:grid-cols-4 gap-5 mb-6">
        <form (ngSubmit)="registerVisit()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">ED Intake</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Patient name</label>
            <input required [(ngModel)]="form.patient" name="patient"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Age</label>
              <input [(ngModel)]="form.age" name="age"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Sex</label>
              <select [(ngModel)]="form.sex" name="sex"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option value="M">M</option><option value="F">F</option><option value="O">O</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Chief complaint</label>
            <input required [(ngModel)]="form.complaint" name="complaint" placeholder="e.g. RTA polytrauma, chest pain"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Triage level</label>
            <select [(ngModel)]="form.triage" name="triage"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let t of triageLevels" [value]="t.value">{{ t.label }}</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">HR (bpm)</label>
              <input type="number" [(ngModel)]="form.hr" name="hr"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">BP (mmHg)</label>
              <input [(ngModel)]="form.bp" name="bp" placeholder="120/80"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">SpO2 (%)</label>
              <input type="number" [(ngModel)]="form.spo2" name="spo2"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Temp (°F)</label>
              <input type="number" step="0.1" [(ngModel)]="form.temp" name="temp"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Attending doctor</label>
            <select required [(ngModel)]="form.doctor" name="doctor"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="" disabled>Select a doctor</option>
              <option *ngFor="let d of doctorOptions()" [value]="d.full_name">{{ d.full_name }} — {{ d.department }}</option>
            </select>
          </div>

          <label class="flex items-center gap-2 text-sm text-body-1">
            <input type="checkbox" [(ngModel)]="form.mlc" name="mlc" class="rounded" />
            Medico-legal case (MLC) — assault, RTA, poisoning, etc.
          </label>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Registering…' : 'Register ED visit' }}
          </button>
        </form>

        <!-- Triage Board, matching the reference's sorted-by-acuity list + summary panel -->
        <div class="xl:col-span-3 grid gap-[18px] items-start" style="grid-template-columns:1.85fr 1fr">
          <div class="bg-white border border-[#e7ecf2] rounded-[14px] p-[16px_18px]">
            <div class="flex items-center justify-between mb-3">
              <h3 class="m-0 text-[14px] font-semibold text-[#1c3a4d]">Triage Board</h3>
              <span class="text-[12px] text-[#8094a6]">Sorted by acuity</span>
            </div>
            <div *ngIf="sortedVisits().length === 0" class="text-center text-body-2 text-sm py-8">No patients currently in the ED.</div>
            <div *ngFor="let v of sortedVisits()" class="border rounded-[12px] p-[13px_15px] mb-[10px] flex gap-4 items-center"
              [style.border-left]="'4px solid ' + triDot(v.triage)" style="border-top-color:#e7ecf2;border-right-color:#e7ecf2;border-bottom-color:#e7ecf2">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-[9px] flex-wrap">
                  <span class="font-semibold text-[#22384a]">{{ v.patient }}</span>
                  <span class="px-[9px] py-0.5 rounded-pill text-[10.5px] font-semibold" [style.background]="triStyle(v.triage).bg" [style.color]="triStyle(v.triage).fg">
                    {{ triStyle(v.triage).label }}
                  </span>
                  <span class="px-[9px] py-0.5 rounded-pill text-[10.5px] font-semibold bg-[#eaeef3] text-[#51687d]">{{ v.status }}</span>
                  <span *ngIf="v.mlc" class="px-2 py-0.5 rounded-pill text-[10px] font-bold bg-[#fbe3e3] text-[#b42318]">MLC</span>
                </div>
                <div class="text-[12.5px] text-[#5f7689] mt-[3px]">{{ v.complaint }}</div>
                <div class="text-[11.5px] text-[#8094a6] mt-[3px]">{{ v.age }}{{ v.age ? 'y' : '' }} {{ v.sex }} · {{ v.doctor }}</div>
              </div>
              <div class="flex gap-[15px] flex-none">
                <div class="text-center"><div class="font-mono font-semibold text-[13px] text-[#26404f]">{{ v.hr || '—' }}</div><div class="text-[9.5px] text-[#9aabbb] tracking-[.3px]">HR</div></div>
                <div class="text-center"><div class="font-mono font-semibold text-[13px] text-[#26404f]">{{ v.bp || '—' }}</div><div class="text-[9.5px] text-[#9aabbb]">BP</div></div>
                <div class="text-center"><div class="font-mono font-semibold text-[13px]" [style.color]="spo2Color(v.spo2)">{{ v.spo2 || '—' }}%</div><div class="text-[9.5px] text-[#9aabbb]">SpO₂</div></div>
                <div class="text-center"><div class="font-mono font-semibold text-[13px] text-[#26404f]">{{ v.temp || '—' }}°</div><div class="text-[9.5px] text-[#9aabbb]">Temp</div></div>
              </div>
              <div class="text-right flex-none w-[54px]">
                <div class="font-mono font-semibold text-[14px] text-[#3f566a]">{{ fmtWait(v.created_at) }}</div>
                <div class="text-[10px] text-[#9aabbb]">waiting</div>
              </div>
              <div class="flex-none">
                <button *ngIf="nextStage(v.status) === 'Closed'" (click)="openDisposition(v)"
                  class="text-[11.5px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] px-3 py-[7px] whitespace-nowrap">
                  Disposition
                </button>
                <button *ngIf="nextStage(v.status) && nextStage(v.status) !== 'Closed'" (click)="advance(v)"
                  class="text-[11.5px] font-semibold bg-[#eaf5f3] text-[#0a6a60] border border-[#c9e7e2] hover:bg-[#dff0ed] rounded-[7px] px-3 py-[7px] whitespace-nowrap">
                  {{ nextStage(v.status) }}
                </button>
              </div>
            </div>
          </div>

          <div class="bg-white border border-[#e7ecf2] rounded-[14px] p-[16px_18px]">
            <h3 class="m-0 mb-3 text-[14px] font-semibold text-[#1c3a4d]">Triage Summary</h3>
            <div *ngFor="let t of triageSummary()" class="flex items-center gap-[11px] py-[10px] border-b border-[#f0f3f7] last:border-0">
              <span class="w-[10px] h-[10px] rounded-full flex-none" [style.background]="t.dot"></span>
              <span class="flex-1 text-[13px] text-[#3f566a]">{{ t.label }}</span>
              <span class="font-mono font-semibold text-[16px] text-[#12303f]">{{ t.n }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Disposition modal -->
      <div *ngIf="dispositioningVisit" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="dispositioningVisit = null">
        <form (ngSubmit)="submitDisposition()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-sm space-y-3">
          <h3 class="font-semibold text-ink-2">Disposition — {{ dispositioningVisit.patient }}</h3>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Outcome</label>
            <select required [(ngModel)]="dispositionValue" name="dispositionValue"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="" disabled>Select outcome</option>
              <option *ngFor="let d of dispositions" [value]="d">{{ d }}</option>
            </select>
          </div>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="dispositioningVisit = null"
              class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold">
              Close visit
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class EmergencyComponent implements OnDestroy {
  triageLevels = TRIAGE_LEVELS;
  dispositions = DISPOSITIONS;
  form: VisitForm = emptyForm();
  submitting = false;
  errorMsg = '';

  dispositioningVisit: any = null;
  dispositionValue = '';

  visits: RealtimeTableHandle<any>;
  doctors: RealtimeTableHandle<Doctor>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.visits = this.realtime.watch('ed_visits', (q) => q.order('created_at', { ascending: false }));
    this.doctors = this.realtime.watch<Doctor>('doctors', (q) => q.eq('active', true).order('full_name'));
  }

  doctorOptions(): Doctor[] {
    return rosterFor(this.doctors.data());
  }

  // Matches the reference's ED KPI row (Patients in ED / Critical / Avg
  // Door-to-Doc / Beds Available). "Beds Available" in the reference is a
  // static fake number (we don't model ED bed capacity) -- replaced with a
  // real MLC case count instead.
  kpis(): KpiItem[] {
    const active = this.visits.data().filter((v: any) => v.status !== 'Closed');
    const critical = active.filter((v: any) => v.triage === 'red');
    const inTriage = active.filter((v: any) => v.status === 'Triage' && v.created_at);
    const avgDoorToDoc = inTriage.length
      ? Math.round(inTriage.reduce((sum: number, v: any) => sum + (Date.now() - new Date(v.created_at).getTime()) / 60000, 0) / inTriage.length)
      : 0;
    const mlcCount = active.filter((v: any) => v.mlc).length;

    return [
      { label: 'Patients in ED', value: String(active.length), icon: 'ph-first-aid-kit', tintKey: 'blue' },
      { label: 'Critical', value: String(critical.length), icon: 'ph-warning-octagon', tintKey: 'red' },
      { label: 'Avg Door-to-Doc', value: inTriage.length ? avgDoorToDoc + 'm' : '—', icon: 'ph-timer', tintKey: 'amber' },
      { label: 'MLC Cases', value: String(mlcCount), icon: 'ph-scales', tintKey: 'green' },
    ];
  }

  fmtWait = fmtWait;

  // Sorted by acuity, matching the reference exactly -- critical first,
  // then urgent, then stable; closed/discharged visits excluded from the board.
  sortedVisits() {
    return this.visits.data()
      .filter((v: any) => v.status !== 'Closed')
      .slice()
      .sort((a: any, b: any) => (TRIAGE_ORDER[a.triage] ?? 3) - (TRIAGE_ORDER[b.triage] ?? 3));
  }

  triStyle(triage: string) {
    return TRI[triage] ?? TRI['green'];
  }

  triDot(triage: string) {
    return this.triStyle(triage).dot;
  }

  spo2Color(spo2: number | null) {
    if (spo2 == null) return '#26404f';
    return spo2 < 92 ? '#b42318' : '#26404f';
  }

  triageSummary() {
    const active = this.visits.data().filter((v: any) => v.status !== 'Closed');
    return [
      { label: 'Critical', n: active.filter((v: any) => v.triage === 'red').length, dot: '#e5484d' },
      { label: 'Urgent', n: active.filter((v: any) => v.triage === 'yellow').length, dot: '#e3a008' },
      { label: 'Stable', n: active.filter((v: any) => v.triage === 'green').length, dot: '#2f9e60' },
    ];
  }

  nextStage(status: string) {
    return NEXT_STAGE[status ?? 'Triage'];
  }

  async registerVisit() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('ed_visits').insert({
        patient: this.form.patient,
        age: this.form.age,
        sex: this.form.sex,
        complaint: this.form.complaint,
        triage: this.form.triage,
        hr: this.form.hr ? Number(this.form.hr) : null,
        bp: this.form.bp,
        spo2: this.form.spo2 ? Number(this.form.spo2) : null,
        temp: this.form.temp ? Number(this.form.temp) : null,
        doctor: this.form.doctor,
        mlc: this.form.mlc,
        status: 'Triage',
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.visits.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async advance(visit: any) {
    const next = NEXT_STAGE[visit.status ?? 'Triage'];
    if (!next) return;
    const { error } = await this.supabaseService.client.from('ed_visits').update({ status: next }).eq('id', visit.id);
    if (error) console.error(error);
  }

  openDisposition(visit: any) {
    this.dispositioningVisit = visit;
    this.dispositionValue = '';
  }

  async submitDisposition() {
    if (!this.dispositioningVisit) return;
    const { error } = await this.supabaseService.client
      .from('ed_visits')
      .update({ status: 'Closed', disposition: this.dispositionValue })
      .eq('id', this.dispositioningVisit.id);
    if (error) {
      alert(error.message);
      return;
    }
    this.dispositioningVisit = null;
    await this.visits.refresh();
  }

  ngOnDestroy() {
    this.visits.dispose();
    this.doctors.dispose();
  }
}
