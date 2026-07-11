import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

const SESSION_TYPES = ['Post-op Mobilization', 'Neuro Rehab', 'Sports Injury', 'Chronic Pain', 'Respiratory Physio', 'Geriatric'];
const STATUS_STYLE: Record<string, string> = {
  Scheduled: 'bg-info-bg text-info-fg',
  Completed: 'bg-success-bg text-success-fg',
  Cancelled: 'bg-line-2 text-body-1',
  'No-show': 'bg-danger-bg text-danger-fg',
};

interface SessionForm {
  patient: string; mrn: string; therapist: string; session_type: string; scheduled_date: string;
}
const emptyForm = (): SessionForm => ({ patient: '', mrn: '', therapist: '', session_type: SESSION_TYPES[0], scheduled_date: '' });

@Component({
  selector: 'app-physiotherapy',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>


      <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <form (ngSubmit)="createSession()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">Schedule Session</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Patient name</label>
            <input required [(ngModel)]="form.patient" name="patient"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">MRN</label>
              <input [(ngModel)]="form.mrn" name="mrn"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Date</label>
              <input required type="date" [(ngModel)]="form.scheduled_date" name="scheduled_date"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Therapist</label>
            <input required [(ngModel)]="form.therapist" name="therapist"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Session type</label>
            <select [(ngModel)]="form.session_type" name="session_type"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let t of sessionTypes" [value]="t">{{ t }}</option>
            </select>
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Scheduling…' : 'Schedule session' }}
          </button>
        </form>

        <div class="xl:col-span-2 bg-white border border-line-1 rounded-card overflow-hidden">
          <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm">Sessions</div>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                <th class="px-4 py-2 font-medium">Patient</th>
                <th class="px-4 py-2 font-medium">Date</th>
                <th class="px-4 py-2 font-medium">Therapist</th>
                <th class="px-4 py-2 font-medium">Status</th>
                <th class="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngIf="!sessions.loading() && sessions.data().length === 0">
                <td colspan="5" class="px-4 py-6 text-center text-body-2">No sessions scheduled yet.</td>
              </tr>
              <tr *ngFor="let s of sessions.data()" class="border-b border-line-2 last:border-0">
                <td class="px-4 py-2">
                  <div class="font-medium text-ink-2">{{ s.patient }}</div>
                  <div class="text-[11.5px] text-muted-1">{{ s.session_type }}</div>
                </td>
                <td class="px-4 py-2 font-mono text-body-1">{{ s.scheduled_date }}</td>
                <td class="px-4 py-2 text-body-1">{{ s.therapist }}</td>
                <td class="px-4 py-2">
                  <span class="px-2 py-0.5 rounded-pill text-[11.5px] font-medium" [class]="statusStyle(s.status)">{{ s.status }}</span>
                </td>
                <td class="px-4 py-2 text-right" *ngIf="s.status === 'Scheduled'">
                  <button (click)="mark(s, 'Completed')" class="text-[12px] font-semibold text-success-fg hover:underline mr-2">Completed</button>
                  <button (click)="mark(s, 'No-show')" class="text-[12px] font-semibold text-danger-fg hover:underline mr-2">No-show</button>
                  <button (click)="mark(s, 'Cancelled')" class="text-[12px] font-semibold text-body-1 hover:underline">Cancel</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class PhysiotherapyComponent implements OnDestroy {
  sessionTypes = SESSION_TYPES;
  form: SessionForm = emptyForm();
  submitting = false;
  errorMsg = '';

  sessions: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.sessions = this.realtime.watch('physio_sessions', (q) => q.order('scheduled_date', { ascending: false }));
  }

  // The reference's "Avg Pain Score" and "Active Plans" track a pain-
  // tracking and treatment-plan system we don't model (sessions only) --
  // replaced with real attendance metrics instead.
  kpis(): KpiItem[] {
    const all = this.sessions.data();
    const today = new Date().toISOString().slice(0, 10);
    const todaySessions = all.filter((s: any) => s.scheduled_date === today);
    const completedToday = todaySessions.filter((s: any) => s.status === 'Completed');
    const noShows = all.filter((s: any) => s.status === 'No-show').length;
    const noShowRate = all.length ? Math.round((noShows / all.length) * 100) : 0;
    return [
      { label: 'Sessions Today', value: String(todaySessions.length), icon: 'ph-person-simple-walk', tintKey: 'teal' },
      { label: 'Completed', value: `${completedToday.length}/${todaySessions.length}`, icon: 'ph-check-circle', tintKey: 'green' },
      { label: 'No-show Rate', value: noShowRate + '%', icon: 'ph-warning', tintKey: 'red' },
      { label: 'Total Sessions', value: String(all.length), icon: 'ph-clipboard-text', tintKey: 'indigo' },
    ];
  }

  statusStyle(status: string) {
    return STATUS_STYLE[status] ?? STATUS_STYLE['Scheduled'];
  }

  async createSession() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('physio_sessions').insert({
        patient: this.form.patient,
        mrn: this.form.mrn,
        therapist: this.form.therapist,
        session_type: this.form.session_type,
        scheduled_date: this.form.scheduled_date,
        status: 'Scheduled',
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.sessions.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async mark(session: any, status: string) {
    const { error } = await this.supabaseService.client.from('physio_sessions').update({ status }).eq('id', session.id);
    if (error) console.error(error);
  }

  ngOnDestroy() {
    this.sessions.dispose();
  }
}
