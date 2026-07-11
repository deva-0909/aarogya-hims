import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { Doctor, bookableDoctors, DOCTOR_STATUS_DOT } from '../../core/doctors';

const DEPARTMENTS = [
  'General Medicine', 'Cardiology', 'General Surgery', 'Orthopedics', 'Gynecology',
  'Obstetrics', 'Pediatrics', 'ENT', 'Dermatology', 'Endocrinology', 'Critical Care',
];

interface RegForm {
  name: string; age: string; sex: string; phone: string; dept: string; doctor: string; type: string;
}

@Component({
  selector: 'app-front-office',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent],
  template: `
    <div>

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

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>

          <button type="submit" [disabled]="submitting || doctorOptions().length === 0"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Registering…' : 'Register & generate token' }}
          </button>
        </form>

        <div class="lg:col-span-2 space-y-5">
          <div class="bg-white border border-line-1 rounded-card overflow-hidden">
            <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm">Today's Registrations</div>
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                  <th class="px-4 py-2 font-medium">Token</th>
                  <th class="px-4 py-2 font-medium">Patient</th>
                  <th class="px-4 py-2 font-medium">Dept / Doctor</th>
                  <th class="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngIf="registrations.loading()">
                  <td colspan="4" class="px-4 py-6 text-center text-body-2">Loading…</td>
                </tr>
                <tr *ngIf="!registrations.loading() && registrations.data().length === 0">
                  <td colspan="4" class="px-4 py-6 text-center text-body-2">No registrations yet today.</td>
                </tr>
                <tr *ngFor="let r of registrations.data()" class="border-b border-line-2 last:border-0">
                  <td class="px-4 py-2 font-mono font-semibold text-body-1">{{ r.token }}</td>
                  <td class="px-4 py-2">
                    <div class="font-medium text-ink-2">{{ r.name }}</div>
                    <div class="text-[11.5px] text-muted-1">{{ r.age }} · {{ r.sex }} · {{ r.type }}</div>
                  </td>
                  <td class="px-4 py-2">
                    <div class="text-body-1">{{ r.dept }}</div>
                    <div class="text-[11.5px] text-muted-1">{{ r.doctor }}</div>
                  </td>
                  <td class="px-4 py-2"><app-status-badge [status]="r.status"></app-status-badge></td>
                </tr>
              </tbody>
            </table>
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
  departments = DEPARTMENTS;
  form: RegForm = { name: '', age: '', sex: 'F', phone: '', dept: DEPARTMENTS[0], doctor: '', type: 'New' };
  submitting = false;
  errorMsg = '';

  registrations: RealtimeTableHandle<any>;
  doctors: RealtimeTableHandle<Doctor>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.registrations = this.realtime.watch('front_desk_registrations', (q) =>
      q.order('created_at', { ascending: false }).limit(50)
    );
    this.doctors = this.realtime.watch<Doctor>('doctors', (q) => q.eq('active', true).order('full_name'));
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
      this.form = { name: '', age: '', sex: 'F', phone: '', dept, doctor: '', type: 'New' };
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
  }
}
