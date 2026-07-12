import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { Doctor, bookableDoctors } from '../../core/doctors';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';
import { PrintLetterheadComponent } from '../../shared/print-letterhead.component';

// Exact colors from the reference prototype's BED color map.
const BED_STYLE: Record<string, { bg: string; fg: string; brd: string }> = {
  occupied: { bg: '#e9eff6', fg: '#2a4866', brd: '#cfdcec' },
  available: { bg: '#e4f4e8', fg: '#1f7a42', brd: '#bfe6c9' },
  reserved: { bg: '#fdf2da', fg: '#97600a', brd: '#f0dcab' },
  cleaning: { bg: '#eef1f4', fg: '#6b7d8f', brd: '#dde3ea' },
};
const BED_CAPTION: Record<string, string> = {
  available: 'Available',
  reserved: 'Reserved',
  cleaning: 'Cleaning',
};

interface AdmitForm {
  name: string; mrn: string; age: string; sex: string; dx: string; consultant: string;
}

const emptyForm = (): AdmitForm => ({ name: '', mrn: '', age: '', sex: 'F', dx: '', consultant: '' });

@Component({
  selector: 'app-ipd',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent, PrintLetterheadComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>
      <div *ngIf="beds.loading()" class="text-body-2">Loading…</div>

      <!-- Legend, matching the reference exactly -->
      <div class="flex gap-[18px] items-center flex-wrap text-[12px] text-[#5f7689] mb-4">
        <span class="flex items-center gap-1.5">
          <span class="w-[13px] h-[13px] rounded-[4px]" style="background:#e9eff6;border:1px solid #cfdcec"></span>Occupied
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-[13px] h-[13px] rounded-[4px]" style="background:#e4f4e8;border:1px solid #bfe6c9"></span>Available
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-[13px] h-[13px] rounded-[4px]" style="background:#fdf2da;border:1px solid #f0dcab"></span>Reserved
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-[13px] h-[13px] rounded-[4px]" style="background:#eef1f4;border:1px solid #dde3ea"></span>Cleaning
        </span>
      </div>

      <div *ngFor="let ward of wards()" class="bg-white border border-line-1 rounded-[14px] p-[16px_18px] mb-4">
        <div class="flex items-center justify-between">
          <h3 class="m-0 text-[14px] font-semibold text-[#1c3a4d]">{{ ward }}</h3>
          <span class="font-mono text-[12px] font-medium text-[#6b8196]">{{ occupiedCount(ward) }}/{{ bedsFor(ward).length }} occupied</span>
        </div>
        <div class="grid gap-[9px] mt-[13px]" style="grid-template-columns:repeat(auto-fill,minmax(98px,1fr))">
          <button
            *ngFor="let bed of bedsFor(ward)"
            (click)="onBedClick(bed)"
            class="text-left rounded-[10px] px-[10px] py-[9px] cursor-pointer min-h-[58px] flex flex-col justify-between hover:brightness-[.97]"
            [style.background]="bedStyle(bed.status).bg"
            [style.border]="'1px solid ' + bedStyle(bed.status).brd"
            [title]="bed.status === 'occupied' ? 'Click to discharge' : bed.status === 'available' ? 'Click to admit' : bed.status"
          >
            <span class="font-mono text-[11.5px] font-semibold" [style.color]="bedStyle(bed.status).fg">{{ bed.label }}</span>
            <span class="text-[11px] truncate opacity-[.85]" [style.color]="bedStyle(bed.status).fg">
              {{ bed.status === 'occupied' ? bed.patient : caption(bed.status) }}
            </span>
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

      <!-- Printable discharge summary, hidden on screen, shown only via @media print -->
      <div *ngIf="printingDischarge" class="print-area hidden">
        <app-print-letterhead title="Discharge Summary"></app-print-letterhead>
        <div style="font-size:13px; margin-bottom:16px;">
          <div style="font-weight:600; color:#12303f; font-size:15px;">{{ printingDischarge.patient }}</div>
          <div style="color:#5f7689; margin-top:2px;">{{ printingDischarge.mrn || '—' }} · {{ printingDischarge.age }}{{ printingDischarge.sex }} · {{ printingDischarge.ward }}, {{ printingDischarge.label }}</div>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:16px;">
          <tbody>
            <tr style="border-bottom:1px solid #f1f4f8;">
              <td style="padding:8px 0; color:#7d92a4; width:160px;">Admitted</td>
              <td style="padding:8px 0;">{{ printingDischarge.admitted_at ? (printingDischarge.admitted_at | date: 'medium') : '—' }}</td>
            </tr>
            <tr style="border-bottom:1px solid #f1f4f8;">
              <td style="padding:8px 0; color:#7d92a4;">Discharged</td>
              <td style="padding:8px 0;">{{ printingDischarge.discharged_at | date: 'medium' }}</td>
            </tr>
            <tr style="border-bottom:1px solid #f1f4f8;">
              <td style="padding:8px 0; color:#7d92a4;">Diagnosis</td>
              <td style="padding:8px 0;">{{ printingDischarge.dx || '—' }}</td>
            </tr>
            <tr style="border-bottom:1px solid #f1f4f8;">
              <td style="padding:8px 0; color:#7d92a4;">Consultant</td>
              <td style="padding:8px 0;">{{ printingDischarge.consultant || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:32px; display:flex; justify-content:flex-end;">
          <div style="text-align:center; font-size:11px; color:#8094a6;">
            <div style="border-top:1px solid #dde5ee; padding-top:4px; width:180px;">Consultant's signature</div>
          </div>
        </div>
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

  bedStyle(status: string) {
    return BED_STYLE[status] ?? BED_STYLE['cleaning'];
  }

  // Matches the reference's IPD KPI row exactly.
  kpis(): KpiItem[] {
    const all = this.beds.data();
    const occ = all.filter((b: any) => b.status === 'occupied').length;
    const avail = all.filter((b: any) => b.status === 'available').length;
    const resv = all.filter((b: any) => b.status === 'reserved').length;
    const occPct = all.length ? Math.round((occ / all.length) * 100) : 0;
    return [
      { label: 'Occupancy', value: occPct + '%', icon: 'ph-gauge', tintKey: 'teal' },
      { label: 'Occupied', value: `${occ}/${all.length}`, icon: 'ph-bed', tintKey: 'blue' },
      { label: 'Available', value: String(avail), icon: 'ph-check-circle', tintKey: 'green' },
      { label: 'Reserved', value: String(resv), icon: 'ph-bookmark-simple', tintKey: 'amber' },
    ];
  }

  caption(status: string) {
    return BED_CAPTION[status] ?? status;
  }

  occupiedCount(ward: string) {
    return this.bedsFor(ward).filter((b: any) => b.status === 'occupied').length;
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
    const client = this.supabaseService.client;

    // Close out the matching open admission record so Discharges KPIs and
    // any future length-of-stay reporting have real data to work with --
    // this was previously never set, silently leaving every admission "open."
    const { data: admission, error: admitErr } = await client
      .from('admissions')
      .update({ discharged_at: new Date().toISOString() })
      .eq('bed_id', bed.id)
      .is('discharged_at', null)
      .select()
      .single();
    if (admitErr) console.error('Failed to close admission record:', admitErr);

    // Snapshot the bed/patient details before clearing the bed, so the
    // discharge summary can still be printed after the row is wiped.
    const dischargeSnapshot = { ...bed, admitted_at: admission?.admitted_at, discharged_at: admission?.discharged_at ?? new Date().toISOString() };

    await client
      .from('beds')
      .update({ status: 'cleaning', patient: null, mrn: null, age: null, sex: null, dx: null, consultant: null })
      .eq('id', bed.id);
    await this.beds.refresh();

    if (confirm('Print a discharge summary for this patient?')) {
      this.printDischargeSummary(dischargeSnapshot);
    }
  }

  printingDischarge: any = null;

  printDischargeSummary(snapshot: any) {
    this.printingDischarge = snapshot;
    setTimeout(() => {
      window.print();
      this.printingDischarge = null;
    }, 50);
  }

  ngOnDestroy() {
    this.beds.dispose();
    this.doctors.dispose();
  }
}
