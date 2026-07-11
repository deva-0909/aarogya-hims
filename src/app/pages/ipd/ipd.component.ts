import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { Doctor, bookableDoctors } from '../../core/doctors';

const STATUS_STYLE: Record<string, string> = {
  available: 'bg-success-bg text-success-fg border-success-fg/20',
  occupied: 'bg-danger-bg text-danger-fg border-danger-fg/20',
  reserved: 'bg-warning-bg text-warning-fg border-warning-fg/20',
  cleaning: 'bg-line-2 text-body-2 border-line-3',
};

interface AdmitForm {
  name: string; mrn: string; age: string; sex: string; dx: string; consultant: string;
}

const emptyForm = (): AdmitForm => ({ name: '', mrn: '', age: '', sex: 'F', dx: '', consultant: '' });

@Component({
  selector: 'app-ipd',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>
      <h1 class="text-xl font-semibold text-ink-1 mb-4">IPD / Wards — Bed Board</h1>

      <div *ngIf="beds.loading()" class="text-body-2">Loading…</div>

      <div *ngFor="let ward of wards()" class="mb-6">
        <h2 class="text-sm font-semibold text-ink-2 mb-2">{{ ward }}</h2>
        <div class="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-2">
          <button
            *ngFor="let bed of bedsFor(ward)"
            (click)="onBedClick(bed)"
            [class]="'text-left border rounded-[10px] p-2.5 ' + (statusStyle(bed.status))"
            [title]="bed.status === 'occupied' ? 'Click to discharge' : bed.status === 'available' ? 'Click to admit' : bed.status"
          >
            <div class="font-mono text-[12px] font-semibold">{{ bed.label }}</div>
            <div class="text-[10.5px] capitalize">{{ bed.status }}</div>
            <div *ngIf="bed.patient" class="text-[11px] truncate mt-0.5">{{ bed.patient }}</div>
          </button>
        </div>
      </div>

      <div *ngIf="activeBed" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="activeBed = null">
        <form (ngSubmit)="admitPatient()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-md space-y-3">
          <h3 class="font-semibold text-ink-2">Admit patient to {{ activeBed.label }} ({{ activeBed.ward }})</h3>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Patient name</label>
            <input required [(ngModel)]="form.name" name="name"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">MRN</label>
              <input required [(ngModel)]="form.mrn" name="mrn"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Age</label>
              <input required type="number" [(ngModel)]="form.age" name="age"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Sex</label>
              <select [(ngModel)]="form.sex" name="sex"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option value="F">F</option><option value="M">M</option><option value="O">O</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Diagnosis</label>
            <input required [(ngModel)]="form.dx" name="dx"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Consultant</label>
            <select
              required
              [(ngModel)]="form.consultant"
              name="consultant"
              [disabled]="consultantOptions().length === 0"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-line-2 disabled:text-muted-1"
            >
              <option value="" disabled>{{ consultantOptions().length ? 'Select a consultant' : 'No doctors available' }}</option>
              <option *ngFor="let d of consultantOptions()" [value]="d.full_name">
                {{ d.full_name }} — {{ d.department }}
              </option>
            </select>
            <div *ngIf="!doctors.loading() && consultantOptions().length === 0" class="text-[11px] text-warning-fg mt-1">
              No doctors currently marked Available. Check the roster's status in the doctors table.
            </div>
          </div>
          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="activeBed = null"
              class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" [disabled]="busy || consultantOptions().length === 0"
              class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold disabled:opacity-60">
              {{ busy ? 'Admitting…' : 'Admit' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class IpdComponent implements OnDestroy {
  beds: RealtimeTableHandle<any>;
  doctors: RealtimeTableHandle<Doctor>;
  activeBed: any = null;
  form: AdmitForm = emptyForm();
  busy = false;
  errorMsg = '';

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.beds = this.realtime.watch('beds', (q) => q.order('ward').order('label'));
    this.doctors = this.realtime.watch<Doctor>('doctors', (q) => q.eq('active', true).order('full_name'));
  }

  // Any currently-Available doctor, across all departments — a consultant
  // admitting to a ward isn't restricted to one department the way OPD is.
  consultantOptions(): Doctor[] {
    return bookableDoctors(this.doctors.data());
  }

  wards() {
    return [...new Set(this.beds.data().map((b: any) => b.ward))];
  }

  bedsFor(ward: string) {
    return this.beds.data().filter((b: any) => b.ward === ward);
  }

  statusStyle(status: string) {
    return STATUS_STYLE[status] ?? STATUS_STYLE['cleaning'];
  }

  onBedClick(bed: any) {
    if (bed.status === 'available') this.openAdmit(bed);
    else if (bed.status === 'occupied') this.dischargeBed(bed);
  }

  openAdmit(bed: any) {
    this.activeBed = bed;
    this.form = emptyForm();
    this.errorMsg = '';
  }

  async admitPatient() {
    this.busy = true;
    this.errorMsg = '';
    const client = this.supabaseService.client;
    try {
      const { data: current, error: fetchErr } = await client
        .from('beds').select('status').eq('id', this.activeBed.id).single();
      if (fetchErr) throw fetchErr;
      if (current.status !== 'available') throw new Error('This bed is no longer available — pick another.');

      const { error: bedErr } = await client
        .from('beds')
        .update({
          status: 'occupied',
          patient: this.form.name,
          mrn: this.form.mrn,
          age: Number(this.form.age),
          sex: this.form.sex,
          dx: this.form.dx,
          consultant: this.form.consultant,
        })
        .eq('id', this.activeBed.id);
      if (bedErr) throw bedErr;

      const { error: admitErr } = await client.from('admissions').insert({
        bed_id: this.activeBed.id,
        patient_name: this.form.name,
        mrn: this.form.mrn,
        age: Number(this.form.age),
        sex: this.form.sex,
        dx: this.form.dx,
        consultant: this.form.consultant,
        ward: this.activeBed.ward,
        bed_label: this.activeBed.label,
        admitted_at: new Date().toISOString(),
      });
      if (admitErr) throw admitErr;

      this.activeBed = null;
      await this.beds.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.busy = false;
    }
  }

  async dischargeBed(bed: any) {
    if (!confirm(`Discharge ${bed.patient} from ${bed.label}? Bed will be marked for cleaning.`)) return;
    await this.supabaseService.client
      .from('beds')
      .update({ status: 'cleaning', patient: null, mrn: null, age: null, sex: null, dx: null, consultant: null })
      .eq('id', bed.id);
    await this.beds.refresh();
  }

  ngOnDestroy() {
    this.beds.dispose();
    this.doctors.dispose();
  }
}
