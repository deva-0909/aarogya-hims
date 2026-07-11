import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { Doctor, rosterFor } from '../../core/doctors';

const TYPES = ['Elective', 'Emergency'];
const ANAESTHESIA_TYPES = ['General', 'Regional', 'Local', 'Sedation'];
const STAGES = ['Scheduled', 'Sent to OT', 'In Progress', 'Completed', 'In Recovery'];
const NEXT_STAGE: Record<string, string> = {
  Scheduled: 'Sent to OT',
  'Sent to OT': 'In Progress',
  'In Progress': 'Completed',
  Completed: 'In Recovery',
};
const PRIORITY_STYLE: Record<string, string> = {
  Routine: 'bg-line-2 text-body-1',
  Urgent: 'bg-warning-bg text-warning-fg',
  Emergency: 'bg-danger-bg text-danger-fg',
};

interface SurgeryForm {
  scheduled_time: string; patient: string; procedure: string; surgeon: string; anaesthetist: string;
  ot: string; type: string; anaesthesia: string; priority: string; consent: boolean;
}
const emptyForm = (): SurgeryForm => ({
  scheduled_time: '', patient: '', procedure: '', surgeon: '', anaesthetist: '',
  ot: '', type: 'Elective', anaesthesia: 'General', priority: 'Routine', consent: false,
});

const CHECKLIST_STEPS = [
  { key: 'signin', label: 'Sign In (before anaesthesia)' },
  { key: 'timeout', label: 'Time Out (before incision)' },
  { key: 'signout', label: 'Sign Out (before leaving OT)' },
];

@Component({
  selector: 'app-surgery',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>

      <div class="grid grid-cols-1 xl:grid-cols-4 gap-5 mb-6">
        <form (ngSubmit)="createSurgery()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">Schedule Surgery</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Patient name</label>
            <input required [(ngModel)]="form.patient" name="patient"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Procedure</label>
            <input required [(ngModel)]="form.procedure" name="procedure"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Time</label>
              <input type="datetime-local" [(ngModel)]="form.scheduled_time" name="scheduled_time"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">OT room</label>
              <input [(ngModel)]="form.ot" name="ot" placeholder="e.g. OT-2"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Surgeon</label>
            <select required [(ngModel)]="form.surgeon" name="surgeon"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="" disabled>Select a doctor</option>
              <option *ngFor="let d of doctorOptions()" [value]="d.full_name">{{ d.full_name }} — {{ d.department }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Anaesthetist</label>
            <select [(ngModel)]="form.anaesthetist" name="anaesthetist"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="">— unassigned —</option>
              <option *ngFor="let d of doctorOptions()" [value]="d.full_name">{{ d.full_name }} — {{ d.department }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Type</label>
              <select [(ngModel)]="form.type" name="type"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option *ngFor="let t of types" [value]="t">{{ t }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Priority</label>
              <select [(ngModel)]="form.priority" name="priority"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option value="Routine">Routine</option>
                <option value="Urgent">Urgent</option>
                <option value="Emergency">Emergency</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Anaesthesia</label>
            <select [(ngModel)]="form.anaesthesia" name="anaesthesia"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let a of anaesthesiaTypes" [value]="a">{{ a }}</option>
            </select>
          </div>
          <label class="flex items-center gap-2 text-sm text-body-1">
            <input type="checkbox" [(ngModel)]="form.consent" name="consent" class="rounded" />
            Informed consent obtained
          </label>
          <div *ngIf="!form.consent" class="text-[11px] text-warning-fg bg-warning-bg rounded-[7px] px-2.5 py-1.5">
            Surgery cannot move past Scheduled without documented consent.
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Scheduling…' : 'Schedule surgery' }}
          </button>
        </form>

        <div class="xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div *ngFor="let col of stages" class="bg-white border border-line-1 rounded-card overflow-hidden">
            <div class="px-3 py-2.5 border-b border-line-1 flex items-center justify-between">
              <span class="font-semibold text-ink-2 text-[12px]">{{ col }}</span>
              <span class="text-[11px] text-muted-1">{{ itemsFor(col).length }}</span>
            </div>
            <div class="p-2.5 space-y-2 min-h-[100px]">
              <div *ngIf="itemsFor(col).length === 0" class="text-[11.5px] text-muted-2 text-center py-5">—</div>
              <div *ngFor="let s of itemsFor(col)" class="border border-line-1 rounded-[9px] p-2.5">
                <div class="flex items-center justify-between mb-0.5">
                  <span class="font-medium text-ink-2 text-[12px] truncate">{{ s.patient }}</span>
                  <span class="px-1.5 py-0.5 rounded-pill text-[10px] font-medium flex-none" [class]="priorityStyle(s.priority)">{{ s.priority }}</span>
                </div>
                <div class="text-[11px] text-muted-1 mb-1">{{ s.procedure }}</div>
                <div class="text-[10.5px] text-muted-1 mb-2">{{ s.ot || '—' }} · {{ s.surgeon }}</div>
                <div *ngIf="!s.consent" class="text-[10px] font-semibold text-danger-fg mb-1.5">Consent pending</div>
                <button *ngIf="s.status === 'Scheduled'" (click)="openChecklist(s)"
                  [disabled]="!s.consent"
                  class="w-full text-[11px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5 disabled:opacity-40">
                  Send to OT
                </button>
                <button *ngIf="s.status !== 'Scheduled' && s.status !== 'Completed' && s.status !== 'In Recovery'" (click)="advance(s)"
                  class="w-full text-[11px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5">
                  Move to {{ nextStage(s.status) }}
                </button>
                <button *ngIf="s.status === 'Completed'" (click)="openPostOp(s)"
                  class="w-full text-[11px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5">
                  Add post-op notes
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- WHO Surgical Safety Checklist -->
      <div *ngIf="checklistSurgery" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="checklistSurgery = null">
        <div (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-sm space-y-3">
          <h3 class="font-semibold text-ink-2">WHO Surgical Safety Checklist — {{ checklistSurgery.patient }}</h3>
          <label *ngFor="let step of checklistSteps" class="flex items-center gap-2 text-sm text-body-1 border border-line-1 rounded-[9px] px-3 py-2">
            <input type="checkbox" [(ngModel)]="checklistState[step.key]" [name]="step.key" class="rounded" />
            {{ step.label }}
          </label>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="checklistSurgery = null" class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="button" (click)="submitChecklist()" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold">
              Confirm & send to OT
            </button>
          </div>
        </div>
      </div>

      <!-- Post-op notes -->
      <div *ngIf="postOpSurgery" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="postOpSurgery = null">
        <form (ngSubmit)="submitPostOp()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-md space-y-3">
          <h3 class="font-semibold text-ink-2">Post-op notes — {{ postOpSurgery.patient }}</h3>
          <textarea required [(ngModel)]="postOpNotes" name="postOpNotes" rows="5"
            class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand"></textarea>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="postOpSurgery = null" class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold">Save</button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class SurgeryComponent implements OnDestroy {
  types = TYPES;
  anaesthesiaTypes = ANAESTHESIA_TYPES;
  stages = STAGES;
  checklistSteps = CHECKLIST_STEPS;
  form: SurgeryForm = emptyForm();
  submitting = false;
  errorMsg = '';

  checklistSurgery: any = null;
  checklistState: Record<string, boolean> = { signin: false, timeout: false, signout: false };
  postOpSurgery: any = null;
  postOpNotes = '';

  surgeries: RealtimeTableHandle<any>;
  doctors: RealtimeTableHandle<Doctor>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.surgeries = this.realtime.watch('surgeries', (q) => q.order('created_at', { ascending: false }));
    this.doctors = this.realtime.watch<Doctor>('doctors', (q) => q.eq('active', true).order('full_name'));
  }

  doctorOptions(): Doctor[] {
    return rosterFor(this.doctors.data());
  }

  itemsFor(status: string) {
    return this.surgeries.data().filter((s: any) => (s.status ?? 'Scheduled') === status);
  }

  nextStage(status: string) {
    return NEXT_STAGE[status ?? 'Scheduled'];
  }

  priorityStyle(priority: string) {
    return PRIORITY_STYLE[priority] ?? PRIORITY_STYLE['Routine'];
  }

  async createSurgery() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('surgeries').insert({
        scheduled_time: this.form.scheduled_time,
        patient: this.form.patient,
        procedure: this.form.procedure,
        surgeon: this.form.surgeon,
        anaesthetist: this.form.anaesthetist,
        ot: this.form.ot,
        type: this.form.type,
        anaesthesia: this.form.anaesthesia,
        priority: this.form.priority,
        consent: this.form.consent,
        status: 'Scheduled',
        checklist: { signin: false, timeout: false, signout: false },
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.surgeries.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async advance(surgery: any) {
    const next = NEXT_STAGE[surgery.status ?? 'Scheduled'];
    if (!next) return;
    const { error } = await this.supabaseService.client.from('surgeries').update({ status: next }).eq('id', surgery.id);
    if (error) console.error(error);
  }

  openChecklist(surgery: any) {
    this.checklistSurgery = surgery;
    this.checklistState = { signin: false, timeout: false, signout: false, ...(surgery.checklist ?? {}) };
  }

  async submitChecklist() {
    if (!this.checklistSurgery) return;
    const { error } = await this.supabaseService.client
      .from('surgeries')
      .update({ checklist: this.checklistState, status: 'Sent to OT' })
      .eq('id', this.checklistSurgery.id);
    if (error) {
      alert(error.message);
      return;
    }
    this.checklistSurgery = null;
    await this.surgeries.refresh();
  }

  openPostOp(surgery: any) {
    this.postOpSurgery = surgery;
    this.postOpNotes = surgery.postop_notes ?? '';
  }

  async submitPostOp() {
    if (!this.postOpSurgery) return;
    const { error } = await this.supabaseService.client
      .from('surgeries')
      .update({ postop_notes: this.postOpNotes })
      .eq('id', this.postOpSurgery.id);
    if (error) {
      alert(error.message);
      return;
    }
    this.postOpSurgery = null;
    await this.surgeries.refresh();
  }

  ngOnDestroy() {
    this.surgeries.dispose();
    this.doctors.dispose();
  }
}
