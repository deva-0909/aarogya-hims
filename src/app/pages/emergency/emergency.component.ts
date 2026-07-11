import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { Doctor, rosterFor } from '../../core/doctors';

const TRIAGE_LEVELS: { value: string; label: string }[] = [
  { value: 'red', label: 'Red — Immediate' },
  { value: 'yellow', label: 'Yellow — Urgent' },
  { value: 'green', label: 'Green — Non-urgent' },
];

const TRIAGE_STYLE: Record<string, string> = {
  red: 'bg-danger-bg text-danger-fg',
  yellow: 'bg-warning-bg text-warning-fg',
  green: 'bg-success-bg text-success-fg',
};

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
  imports: [CommonModule, FormsModule],
  template: `
    <div>

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

        <!-- Kanban -->
        <div class="xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div *ngFor="let col of stages" class="bg-white border border-line-1 rounded-card overflow-hidden">
            <div class="px-3 py-2.5 border-b border-line-1 flex items-center justify-between">
              <span class="font-semibold text-ink-2 text-[12.5px]">{{ col }}</span>
              <span class="text-[11px] text-muted-1">{{ itemsFor(col).length }}</span>
            </div>
            <div class="p-2.5 space-y-2 min-h-[100px]">
              <div *ngIf="itemsFor(col).length === 0" class="text-[11.5px] text-muted-2 text-center py-5">—</div>
              <div *ngFor="let v of itemsFor(col)" class="border rounded-[9px] p-2.5"
                [class]="v.triage === 'red' ? 'border-danger-fg' : 'border-line-1'">
                <div class="flex items-center justify-between mb-0.5">
                  <span class="font-medium text-ink-2 text-[12.5px] truncate">{{ v.patient }}</span>
                  <span class="px-1.5 py-0.5 rounded-pill text-[10px] font-medium flex-none" [class]="triageStyle(v.triage)">
                    {{ v.triage | uppercase }}
                  </span>
                </div>
                <div class="text-[11px] text-muted-1 mb-1">{{ v.age }}{{ v.age ? 'y' : '' }} {{ v.sex }} · {{ v.complaint }}</div>
                <div class="text-[10.5px] text-muted-1 mb-1" *ngIf="v.hr || v.bp || v.spo2">
                  {{ v.hr ? 'HR ' + v.hr : '' }}{{ v.bp ? ' · BP ' + v.bp : '' }}{{ v.spo2 ? ' · SpO2 ' + v.spo2 + '%' : '' }}
                </div>
                <div class="text-[10.5px] text-muted-1 mb-2">{{ v.doctor }}</div>
                <div *ngIf="v.mlc" class="text-[10.5px] font-semibold text-warning-fg mb-1.5 flex items-center gap-1">
                  <i class="ph ph-scales"></i> MLC
                </div>
                <div *ngIf="v.disposition" class="text-[10.5px] font-medium text-ink-2 mb-1.5">
                  Disposition: {{ v.disposition }}
                </div>
                <button *ngIf="nextStage(v.status) === 'Closed'" (click)="openDisposition(v)"
                  class="w-full text-[11.5px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5">
                  Set disposition
                </button>
                <button *ngIf="nextStage(v.status) && nextStage(v.status) !== 'Closed'" (click)="advance(v)"
                  class="w-full text-[11.5px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5">
                  Move to {{ nextStage(v.status) }}
                </button>
              </div>
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
  stages = STAGES;
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

  itemsFor(stage: string) {
    return this.visits.data().filter((v: any) => (v.status ?? 'Triage') === stage);
  }

  nextStage(status: string) {
    return NEXT_STAGE[status ?? 'Triage'];
  }

  triageStyle(triage: string) {
    return TRIAGE_STYLE[triage] ?? TRIAGE_STYLE['green'];
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
