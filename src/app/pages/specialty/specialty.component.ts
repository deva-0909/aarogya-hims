import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { Doctor, rosterFor } from '../../core/doctors';

const DEPARTMENTS = [
  'Cardiology', 'Neurology', 'Oncology', 'Nephrology', 'Gastroenterology',
  'Endocrinology', 'Orthopedics', 'ENT', 'Dermatology', 'Psychiatry',
];
const STAGES = ['Referred', 'Scheduled', 'Seen', 'Completed'];
const NEXT_STAGE: Record<string, string> = { Referred: 'Scheduled', Scheduled: 'Seen', Seen: 'Completed' };

interface ReferralForm {
  patient: string; mrn: string; from_doctor: string; to_department: string; reason: string;
}
const emptyForm = (): ReferralForm => ({ patient: '', mrn: '', from_doctor: '', to_department: DEPARTMENTS[0], reason: '' });

@Component({
  selector: 'app-specialty',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>

      <div class="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <form (ngSubmit)="createReferral()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">New Referral</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Patient name</label>
            <input required [(ngModel)]="form.patient" name="patient"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">MRN</label>
            <input [(ngModel)]="form.mrn" name="mrn"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Referring doctor</label>
            <select required [(ngModel)]="form.from_doctor" name="from_doctor"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="" disabled>Select a doctor</option>
              <option *ngFor="let d of doctorOptions()" [value]="d.full_name">{{ d.full_name }} — {{ d.department }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Refer to</label>
            <select [(ngModel)]="form.to_department" name="to_department"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let d of departments" [value]="d">{{ d }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Reason</label>
            <input required [(ngModel)]="form.reason" name="reason"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Submitting…' : 'Submit referral' }}
          </button>
        </form>

        <div class="xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div *ngFor="let col of stages" class="bg-white border border-line-1 rounded-card overflow-hidden">
            <div class="px-3 py-2.5 border-b border-line-1 flex items-center justify-between">
              <span class="font-semibold text-ink-2 text-[12.5px]">{{ col }}</span>
              <span class="text-[11px] text-muted-1">{{ itemsFor(col).length }}</span>
            </div>
            <div class="p-2.5 space-y-2 min-h-[100px]">
              <div *ngIf="itemsFor(col).length === 0" class="text-[11.5px] text-muted-2 text-center py-5">—</div>
              <div *ngFor="let r of itemsFor(col)" class="border border-line-1 rounded-[9px] p-2.5">
                <div class="font-medium text-ink-2 text-[12.5px] mb-0.5">{{ r.patient }}</div>
                <div class="text-[11px] text-muted-1 mb-1">→ {{ r.to_department }}</div>
                <div class="text-[10.5px] text-muted-1 mb-2">{{ r.from_doctor }} · {{ r.reason }}</div>
                <button *ngIf="nextStage(r.status)" (click)="advance(r)"
                  class="w-full text-[11.5px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5">
                  Move to {{ nextStage(r.status) }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SpecialtyComponent implements OnDestroy {
  departments = DEPARTMENTS;
  stages = STAGES;
  form: ReferralForm = emptyForm();
  submitting = false;
  errorMsg = '';

  referrals: RealtimeTableHandle<any>;
  doctors: RealtimeTableHandle<Doctor>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.referrals = this.realtime.watch('specialty_referrals', (q) => q.order('created_at', { ascending: false }));
    this.doctors = this.realtime.watch<Doctor>('doctors', (q) => q.eq('active', true).order('full_name'));
  }

  doctorOptions(): Doctor[] {
    return rosterFor(this.doctors.data());
  }

  itemsFor(status: string) {
    return this.referrals.data().filter((r: any) => (r.status ?? 'Referred') === status);
  }

  nextStage(status: string) {
    return NEXT_STAGE[status ?? 'Referred'];
  }

  async createReferral() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('specialty_referrals').insert({
        patient: this.form.patient,
        mrn: this.form.mrn,
        from_doctor: this.form.from_doctor,
        to_department: this.form.to_department,
        reason: this.form.reason,
        status: 'Referred',
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.referrals.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async advance(referral: any) {
    const next = NEXT_STAGE[referral.status ?? 'Referred'];
    if (!next) return;
    const { error } = await this.supabaseService.client.from('specialty_referrals').update({ status: next }).eq('id', referral.id);
    if (error) console.error(error);
  }

  ngOnDestroy() {
    this.referrals.dispose();
    this.doctors.dispose();
  }
}
