import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { Doctor, rosterFor } from '../../core/doctors';

const ACUITY_STYLE: Record<string, string> = {
  Stable: 'bg-success-bg text-success-fg',
  Watcher: 'bg-warning-bg text-warning-fg',
  Critical: 'bg-danger-bg text-danger-fg',
};

interface AdmitForm {
  patient: string; mrn: string; dx: string; consultant: string; nurse: string; acuity: string;
}
const emptyAdmitForm = (): AdmitForm => ({ patient: '', mrn: '', dx: '', consultant: '', nurse: '', acuity: 'Watcher' });

interface VitalsForm {
  hr: string; bp: string; spo2: string; rr: string; temp: string; ventilated: boolean; vent_settings: string;
}
const emptyVitalsForm = (): VitalsForm => ({ hr: '', bp: '', spo2: '', rr: '', temp: '', ventilated: false, vent_settings: '' });

@Component({
  selector: 'app-icu',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>
      <h1 class="text-xl font-semibold text-ink-1 mb-4">ICU / Critical Care</h1>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div *ngFor="let bed of beds.data()"
          class="border rounded-card p-3 cursor-pointer"
          [class]="bed.status === 'occupied' ? 'border-line-1 bg-white' : 'border-line-1 bg-line-2/40 hover:bg-line-2'"
          (click)="bed.status === 'occupied' ? openVitals(bed) : openAdmit(bed)">
          <div class="flex items-center justify-between mb-1">
            <span class="font-mono text-[13px] font-semibold text-ink-2">{{ bed.bed }}</span>
            <span *ngIf="bed.acuity" class="px-1.5 py-0.5 rounded-pill text-[10px] font-medium" [class]="acuityStyle(bed.acuity)">{{ bed.acuity }}</span>
          </div>
          <div *ngIf="bed.status === 'available'" class="text-[11.5px] text-muted-2 py-3 text-center">Available — click to admit</div>
          <div *ngIf="bed.status === 'occupied'">
            <div class="text-[12.5px] font-medium text-ink-2 truncate">{{ bed.patient }}</div>
            <div class="text-[11px] text-muted-1 truncate mb-1.5">{{ bed.dx }}</div>
            <div class="text-[10.5px] text-body-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
              <span *ngIf="bed.hr">HR {{ bed.hr }}</span>
              <span *ngIf="bed.spo2">SpO2 {{ bed.spo2 }}%</span>
              <span *ngIf="bed.bp">BP {{ bed.bp }}</span>
              <span *ngIf="bed.rr">RR {{ bed.rr }}</span>
            </div>
            <div *ngIf="bed.ventilated" class="text-[10px] font-semibold text-info-fg mt-1 flex items-center gap-1">
              <i class="ph ph-wind"></i> Ventilated
            </div>
          </div>
        </div>
      </div>

      <!-- Admit modal -->
      <div *ngIf="admittingBed" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="admittingBed = null">
        <form (ngSubmit)="admitPatient()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-md space-y-3">
          <h3 class="font-semibold text-ink-2">Admit to {{ admittingBed.bed }}</h3>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Patient name</label>
            <input required [(ngModel)]="admitForm.patient" name="patient"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">MRN</label>
              <input [(ngModel)]="admitForm.mrn" name="mrn"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Acuity</label>
              <select [(ngModel)]="admitForm.acuity" name="acuity"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option value="Stable">Stable</option>
                <option value="Watcher">Watcher</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Diagnosis</label>
            <input required [(ngModel)]="admitForm.dx" name="dx"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Consultant</label>
            <select required [(ngModel)]="admitForm.consultant" name="consultant"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="" disabled>Select a doctor</option>
              <option *ngFor="let d of doctorOptions()" [value]="d.full_name">{{ d.full_name }} — {{ d.department }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Assigned nurse</label>
            <select [(ngModel)]="admitForm.nurse" name="nurse"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="">— unassigned —</option>
              <option *ngFor="let n of nurseOptions()" [value]="n.full_name">{{ n.full_name }}</option>
            </select>
          </div>
          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="admittingBed = null" class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" [disabled]="submitting" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold disabled:opacity-60">
              {{ submitting ? 'Admitting…' : 'Admit' }}
            </button>
          </div>
        </form>
      </div>

      <!-- Vitals / discharge modal -->
      <div *ngIf="vitalsBed" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="vitalsBed = null">
        <form (ngSubmit)="updateVitals()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-md space-y-3">
          <h3 class="font-semibold text-ink-2">{{ vitalsBed.bed }} — {{ vitalsBed.patient }}</h3>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">HR (bpm)</label>
              <input type="number" [(ngModel)]="vitalsForm.hr" name="hr" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">BP (mmHg)</label>
              <input [(ngModel)]="vitalsForm.bp" name="bp" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">SpO2 (%)</label>
              <input type="number" [(ngModel)]="vitalsForm.spo2" name="spo2" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">RR (/min)</label>
              <input type="number" [(ngModel)]="vitalsForm.rr" name="rr" class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>
          <label class="flex items-center gap-2 text-sm text-body-1">
            <input type="checkbox" [(ngModel)]="vitalsForm.ventilated" name="ventilated" class="rounded" />
            On ventilator
          </label>
          <div *ngIf="vitalsForm.ventilated">
            <label class="block text-xs font-medium text-body-1 mb-1">Vent settings</label>
            <input [(ngModel)]="vitalsForm.vent_settings" name="vent_settings" placeholder="e.g. AC/VC, FiO2 40%, PEEP 5"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="dischargeBed()" class="flex-1 border border-danger-fg text-danger-fg rounded-[9px] py-2 text-sm font-medium">Discharge</button>
            <button type="submit" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold">Update vitals</button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class IcuComponent implements OnDestroy {
  beds: RealtimeTableHandle<any>;
  doctors: RealtimeTableHandle<Doctor>;
  staff: RealtimeTableHandle<any>;

  admittingBed: any = null;
  admitForm: AdmitForm = emptyAdmitForm();
  vitalsBed: any = null;
  vitalsForm: VitalsForm = emptyVitalsForm();
  submitting = false;
  errorMsg = '';

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.beds = this.realtime.watch('icu_beds', (q) => q.order('bed'));
    this.doctors = this.realtime.watch<Doctor>('doctors', (q) => q.eq('active', true).order('full_name'));
    this.staff = this.realtime.watch('staff_directory', (q) => q.eq('role', 'nurse').order('full_name'));
  }

  doctorOptions(): Doctor[] {
    return rosterFor(this.doctors.data());
  }

  nurseOptions() {
    return this.staff.data();
  }

  acuityStyle(acuity: string) {
    return ACUITY_STYLE[acuity] ?? ACUITY_STYLE['Watcher'];
  }

  openAdmit(bed: any) {
    this.admittingBed = bed;
    this.admitForm = emptyAdmitForm();
    this.errorMsg = '';
  }

  openVitals(bed: any) {
    this.vitalsBed = bed;
    this.vitalsForm = {
      hr: bed.hr ?? '', bp: bed.bp ?? '', spo2: bed.spo2 ?? '', rr: bed.rr ?? '',
      temp: bed.temp ?? '', ventilated: !!bed.ventilated, vent_settings: bed.vent_settings ?? '',
    };
  }

  async admitPatient() {
    this.submitting = true;
    this.errorMsg = '';
    try {
      const { data: current, error: fetchErr } = await this.supabaseService.client
        .from('icu_beds').select('status').eq('id', this.admittingBed.id).single();
      if (fetchErr) throw fetchErr;
      if (current.status !== 'available') throw new Error('This bed is no longer available.');

      const { error } = await this.supabaseService.client
        .from('icu_beds')
        .update({
          status: 'occupied',
          patient: this.admitForm.patient,
          mrn: this.admitForm.mrn,
          dx: this.admitForm.dx,
          consultant: this.admitForm.consultant,
          nurse: this.admitForm.nurse,
          acuity: this.admitForm.acuity,
        })
        .eq('id', this.admittingBed.id);
      if (error) throw error;
      this.admittingBed = null;
      await this.beds.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async updateVitals() {
    const { error } = await this.supabaseService.client
      .from('icu_beds')
      .update({
        hr: this.vitalsForm.hr ? Number(this.vitalsForm.hr) : null,
        bp: this.vitalsForm.bp,
        spo2: this.vitalsForm.spo2 ? Number(this.vitalsForm.spo2) : null,
        rr: this.vitalsForm.rr ? Number(this.vitalsForm.rr) : null,
        temp: this.vitalsForm.temp ? Number(this.vitalsForm.temp) : null,
        ventilated: this.vitalsForm.ventilated,
        vent_settings: this.vitalsForm.vent_settings,
      })
      .eq('id', this.vitalsBed.id);
    if (error) {
      alert(error.message);
      return;
    }
    this.vitalsBed = null;
    await this.beds.refresh();
  }

  async dischargeBed() {
    if (!confirm(`Discharge ${this.vitalsBed.patient} from ${this.vitalsBed.bed}?`)) return;
    const { error } = await this.supabaseService.client
      .from('icu_beds')
      .update({
        status: 'available', patient: null, mrn: null, dx: null, consultant: null, nurse: null,
        acuity: null, hr: null, bp: null, spo2: null, rr: null, temp: null, ventilated: false, vent_settings: null,
      })
      .eq('id', this.vitalsBed.id);
    if (error) {
      alert(error.message);
      return;
    }
    this.vitalsBed = null;
    await this.beds.refresh();
  }

  ngOnDestroy() {
    this.beds.dispose();
    this.doctors.dispose();
    this.staff.dispose();
  }
}
