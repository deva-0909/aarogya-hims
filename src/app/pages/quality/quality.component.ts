import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';

const STAGES = ['Reported', 'Under RCA', 'Action Plan', 'Closed'];
const NEXT_STAGE: Record<string, string> = {
  Reported: 'Under RCA',
  'Under RCA': 'Action Plan',
  'Action Plan': 'Closed',
};

interface IncidentForm {
  description: string; reported_by_name: string;
}
const emptyForm = (): IncidentForm => ({ description: '', reported_by_name: '' });

@Component({
  selector: 'app-quality',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>
      <h1 class="text-xl font-semibold text-ink-1 mb-4">Quality Assurance & Accreditation</h1>
      <p class="text-[12.5px] text-muted-1 mb-4 max-w-2xl">
        Patient safety incident reporting — visible only to Quality, HR, and Admin roles in a production
        deployment. Every deployment should keep this restricted; the demo-mode database policy applied
        to this project currently leaves it open like every other table (see the project README).
      </p>

      <div class="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <form (ngSubmit)="reportIncident()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">Report Incident</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Description</label>
            <textarea required [(ngModel)]="form.description" name="description" rows="4"
              placeholder="What happened, where, and when — factual, no blame language"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand"></textarea>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Reported by</label>
            <input [(ngModel)]="form.reported_by_name" name="reported_by_name"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Submitting…' : 'Submit report' }}
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
              <div *ngFor="let i of itemsFor(col)" class="border border-line-1 rounded-[9px] p-2.5">
                <div class="text-[12px] text-ink-2 mb-1.5 leading-snug">{{ i.description }}</div>
                <div class="text-[10.5px] text-muted-1 mb-2">{{ i.reported_by_name || 'Anonymous' }}</div>
                <button *ngIf="nextStage(i.stage)" (click)="openAction(i)"
                  class="w-full text-[11.5px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] py-1.5">
                  Move to {{ nextStage(i.stage) }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div *ngIf="actionIncident" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="actionIncident = null">
        <form (ngSubmit)="submitAction()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-md space-y-3">
          <h3 class="font-semibold text-ink-2">{{ nextStage(actionIncident.stage) }} — notes</h3>
          <textarea [(ngModel)]="actionNotes" name="actionNotes" rows="4"
            [placeholder]="nextStage(actionIncident.stage) === 'Under RCA' ? 'Root cause analysis notes' : nextStage(actionIncident.stage) === 'Action Plan' ? 'Corrective action plan' : 'Closing notes'"
            class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand"></textarea>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="actionIncident = null" class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold">Save</button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class QualityComponent implements OnDestroy {
  stages = STAGES;
  form: IncidentForm = emptyForm();
  submitting = false;
  errorMsg = '';

  actionIncident: any = null;
  actionNotes = '';

  incidents: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.incidents = this.realtime.watch('patient_safety_incidents', (q) => q.order('created_at', { ascending: false }));
  }

  itemsFor(stage: string) {
    return this.incidents.data().filter((i: any) => (i.stage ?? 'Reported') === stage);
  }

  nextStage(stage: string) {
    return NEXT_STAGE[stage ?? 'Reported'];
  }

  async reportIncident() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('patient_safety_incidents').insert({
        description: this.form.description,
        reported_by_name: this.form.reported_by_name,
        stage: 'Reported',
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.incidents.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  openAction(incident: any) {
    this.actionIncident = incident;
    this.actionNotes = '';
  }

  async submitAction() {
    if (!this.actionIncident) return;
    const next = NEXT_STAGE[this.actionIncident.stage ?? 'Reported'];
    const patch: any = { stage: next };
    if (next === 'Under RCA') patch.rca_notes = this.actionNotes;
    if (next === 'Action Plan') patch.action_plan = this.actionNotes;
    const { error } = await this.supabaseService.client.from('patient_safety_incidents').update(patch).eq('id', this.actionIncident.id);
    if (error) {
      alert(error.message);
      return;
    }
    this.actionIncident = null;
    await this.incidents.refresh();
  }

  ngOnDestroy() {
    this.incidents.dispose();
  }
}
