import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';
import { Doctor, bookableDoctors, DOCTOR_STATUS_DOT } from '../../core/doctors';

const DEPARTMENTS = [
  'General Medicine', 'Cardiology', 'General Surgery', 'Orthopedics', 'Gynecology',
  'Obstetrics', 'Pediatrics', 'ENT', 'Dermatology', 'Endocrinology', 'Critical Care',
];

interface RegForm {
  name: string; age: string; sex: string; phone: string; dept: string; doctor: string; type: string; allergies: string;
}

function fmtWait(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m + 'm';
}

@Component({
  selector: 'app-front-office',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <form (ngSubmit)="handleRegister()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 lg:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">New Registration</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Patient name</label>
            <input required [(ngModel)]="form.name" name="name"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Age</label>
              <input required type="number" min="0" [(ngModel)]="form.age" name="age"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Sex</label>
              <select [(ngModel)]="form.sex" name="sex"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option value="F">F</option>
                <option value="M">M</option>
                <option value="O">O</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Phone</label>
            <input required [(ngModel)]="form.phone" name="phone"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Department</label>
            <select [(ngModel)]="form.dept" name="dept" (ngModelChange)="onDeptChange()"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let d of departments" [value]="d">{{ d }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Doctor</label>
            <select
              required
              [(ngModel)]="form.doctor"
              name="doctor"
              [disabled]="doctorOptions().length === 0"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-line-2 disabled:text-muted-1"
            >
              <option value="" disabled>{{ doctorOptions().length ? 'Select a doctor' : 'No doctors available' }}</option>
              <option *ngFor="let d of doctorOptions()" [value]="d.full_name">
                {{ d.full_name }}{{ d.designation ? ' — ' + d.designation : '' }}
              </option>
            </select>
            <div *ngIf="doctors.loading()" class="text-[11px] text-muted-1 mt-1">Loading doctor roster…</div>
            <div *ngIf="!doctors.loading() && doctorOptions().length === 0" class="text-[11px] text-warning-fg mt-1">
              No doctors currently available in {{ form.dept }}. Try another department, or check the roster's status in the doctors table.
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Visit type</label>
            <select [(ngModel)]="form.type" name="type"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option>New</option>
              <option>Follow-up</option>
              <option>Emergency</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Known allergies (optional)</label>
            <input [(ngModel)]="form.allergies" name="allergies" placeholder="e.g. Penicillin, Sulfa -- comma-separated"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            <p class="text-[10.5px] text-muted-1 mt-1">Recorded at Moderate severity by default -- refine severity later via the patient's allergy list.</p>
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>

          <button type="submit" [disabled]="submitting || doctorOptions().length === 0"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Registering…' : 'Register & generate token' }}
          </button>
        </form>

        <div class="lg:col-span-2 space-y-5">
          <div class="bg-white border border-[#e7ecf2] rounded-[14px] overflow-hidden">
            <div class="px-[18px] py-[14px] border-b border-[#eef2f6] flex items-center justify-between">
              <h3 class="m-0 text-[14px] font-semibold text-[#1c3a4d]">Registration Queue</h3>
              <span class="text-[12px] text-[#8094a6]">Live · updated just now</span>
            </div>
            <div class="grid px-[18px] py-[9px] bg-[#f7f9fb] border-b border-[#eef2f6] text-[10.5px] font-semibold tracking-[.4px] text-[#7d92a4] uppercase"
              style="grid-template-columns:64px 1.5fr 86px 1.3fr 1fr 56px 122px">
              <span>Token</span><span>Patient</span><span>Type</span><span>Department</span><span>Doctor</span><span>Wait</span><span>Status</span>
            </div>
            <div *ngIf="registrations.loading()" class="text-center text-body-2 py-6 text-sm">Loading…</div>
            <div *ngIf="!registrations.loading() && registrations.data().length === 0" class="text-center text-body-2 py-6 text-sm">
              No registrations yet today.
            </div>
            <div *ngFor="let r of registrations.data()" class="grid items-center px-[18px] py-[10px] border-b border-[#f1f4f8] text-[13px]"
              style="grid-template-columns:64px 1.5fr 86px 1.3fr 1fr 56px 122px">
              <span class="font-mono font-semibold text-[12px] text-brand">{{ r.token }}</span>
              <div class="min-w-0">
                <div class="font-medium text-[#22384a] truncate">{{ r.name }}</div>
                <div class="text-[11.5px] text-[#8094a6]">{{ r.age }} · {{ r.sex }}</div>
              </div>
              <span class="text-[12px] text-[#5f7689]">{{ r.type }}</span>
              <span class="text-[#3f566a] truncate">{{ r.dept }}</span>
              <span class="text-[#5f7689] truncate">{{ r.doctor }}</span>
              <span class="font-mono text-[12px] text-[#6b8196]">{{ fmtWait(r.created_at) }}</span>
              <span><app-status-badge [status]="r.status"></app-status-badge></span>
            </div>
          </div>

          <div class="bg-white border border-line-1 rounded-card overflow-hidden">
            <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm">
              {{ form.dept }} — Doctor Roster
            </div>
            <div class="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div *ngIf="!doctors.loading() && deptRoster().length === 0" class="col-span-2 text-center text-body-2 py-4 text-sm">
                No doctors on file for this department yet.
              </div>
              <div *ngFor="let d of deptRoster()" class="flex items-center gap-2.5 border border-line-1 rounded-[9px] px-3 py-2">
                <span class="w-2 h-2 rounded-full flex-none" [class]="statusDot(d.status)"></span>
                <div class="min-w-0">
                  <div class="text-[13px] font-medium text-ink-2 truncate">{{ d.full_name }}</div>
                  <div class="text-[11px] text-muted-1">{{ d.designation || '—' }} · {{ d.status }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class FrontOfficeComponent implements OnDestroy {
  fmtWait = fmtWait;
  departments = DEPARTMENTS;
  form: RegForm = { name: '', age: '', sex: 'F', phone: '', dept: DEPARTMENTS[0], doctor: '', type: 'New', allergies: '' };
  submitting = false;
  errorMsg = '';

  registrations: RealtimeTableHandle<any>;
  doctors: RealtimeTableHandle<Doctor>;
  invoices: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.registrations = this.realtime.watch('front_desk_registrations', (q) =>
      q.order('created_at', { ascending: false }).limit(50)
    );
    this.doctors = this.realtime.watch<Doctor>('doctors', (q) => q.eq('active', true).order('full_name'));
    this.invoices = this.realtime.watch('invoices');
  }

  // Matches the reference's Front Office KPI row (Registrations Today,
  // Appointments, Walk-ins, Pending Bills) -- "Appointments"/"Walk-ins" map
  // onto our real visit `type` field (Follow-up / New) as the closest real
  // equivalent, since we don't track a separate appointment-booking concept.
  kpis(): KpiItem[] {
    const todayStart = new Date().toISOString().slice(0, 10);
    const today = this.registrations.data().filter((r: any) => (r.created_at ?? '').slice(0, 10) === todayStart);
    return [
      { label: 'Registrations Today', value: String(today.length), icon: 'ph-user-plus', tintKey: 'blue' },
      { label: 'Appointments', value: String(today.filter((r: any) => r.type === 'Follow-up').length), icon: 'ph-calendar-check', tintKey: 'teal' },
      { label: 'Walk-ins', value: String(today.filter((r: any) => r.type === 'New').length), icon: 'ph-footprints', tintKey: 'indigo' },
      { label: 'Pending Bills', value: String(this.invoices.data().filter((i: any) => i.status !== 'Paid').length), icon: 'ph-receipt', tintKey: 'amber' },
    ];
  }

  // Doctors selectable for a *new* registration: on the roster, in this department, actually Available.
  doctorOptions(): Doctor[] {
    return bookableDoctors(this.doctors.data(), this.form.dept);
  }

  // Full department roster (any status) shown as a reference panel so front
  // desk staff can see who's on leave / in surgery, not just who's bookable.
  deptRoster(): Doctor[] {
    return this.doctors.data().filter((d) => d.department === this.form.dept);
  }

  statusDot(status: string) {
    return DOCTOR_STATUS_DOT[status] ?? 'bg-muted-1';
  }

  onDeptChange() {
    // Selected doctor may not exist/be available in the new department — reset it.
    this.form.doctor = '';
  }

  async handleRegister() {
    this.errorMsg = '';
    this.submitting = true;
    const client = this.supabaseService.client;
    try {
      const todayStart = new Date().toISOString().slice(0, 10);
      const { count } = await client
        .from('front_desk_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('dept', this.form.dept)
        .gte('created_at', todayStart);

      const token = `${this.form.dept.slice(0, 1).toUpperCase()}-${String((count ?? 0) + 1).padStart(3, '0')}`;

      const { data: patient, error: patientErr } = await client
        .from('patients')
        .insert({
          name: this.form.name,
          age: Number(this.form.age),
          sex: this.form.sex,
          phone: this.form.phone,
          dept: this.form.dept,
          doctor: this.form.doctor,
          type: this.form.type,
          token,
          status: 'OPD · Waiting',
        })
        .select()
        .single();
      if (patientErr) throw patientErr;

      const allergenNames = this.form.allergies
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
      if (allergenNames.length > 0) {
        const { error: allergyErr } = await client.from('patient_allergies').insert(
          allergenNames.map((allergen) => ({ patient_id: patient.id, allergen, severity: 'Moderate' }))
        );
        // Non-fatal: registration already succeeded -- an allergy insert
        // failure shouldn't block the whole workflow, just surface it.
        if (allergyErr) console.error('Failed to save allergies:', allergyErr);
      }

      const { error: regErr } = await client.from('front_desk_registrations').insert({
        patient_id: patient.id,
        token,
        name: this.form.name,
        age: Number(this.form.age),
        sex: this.form.sex,
        type: this.form.type,
        dept: this.form.dept,
        doctor: this.form.doctor,
        status: 'Waiting',
        wait: 0,
      });
      if (regErr) throw regErr;

      const { error: opdErr } = await client.from('opd_visits').insert({
        patient_id: patient.id,
        token,
        name: this.form.name,
        age: Number(this.form.age),
        sex: this.form.sex,
        dept: this.form.dept,
        doctor: this.form.doctor,
        in_time: new Date().toTimeString().slice(0, 5),
        wait: 0,
        status: 'Waiting',
      });
      if (opdErr) throw opdErr;

      const dept = this.form.dept;
      this.form = { name: '', age: '', sex: 'F', phone: '', dept, doctor: '', type: 'New', allergies: '' };
      await this.registrations.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  ngOnDestroy() {
    this.registrations.dispose();
    this.doctors.dispose();
    this.invoices.dispose();
  }
}
