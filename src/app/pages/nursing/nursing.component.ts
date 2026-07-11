import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';

const ROUTES = ['PO', 'IV', 'IM', 'SC', 'Topical', 'Inhalation'];
const STATUS_STYLE: Record<string, string> = {
  Due: 'bg-warning-bg text-warning-fg',
  Given: 'bg-success-bg text-success-fg',
  Missed: 'bg-danger-bg text-danger-fg',
  Held: 'bg-line-2 text-body-1',
};

interface MarForm {
  patient: string; mrn: string; ward: string; drug: string; dose: string; route: string; scheduled_time: string;
}
const emptyForm = (): MarForm => ({ patient: '', mrn: '', ward: '', drug: '', dose: '', route: ROUTES[0], scheduled_time: '' });

@Component({
  selector: 'app-nursing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>
      <h1 class="text-xl font-semibold text-ink-1 mb-4">Nursing — Medication Administration</h1>

      <div class="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <form (ngSubmit)="createEntry()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">Add to MAR</h2>

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
              <label class="block text-xs font-medium text-body-1 mb-1">Ward / Bed</label>
              <input [(ngModel)]="form.ward" name="ward" placeholder="e.g. GA-02"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Drug</label>
            <input required [(ngModel)]="form.drug" name="drug"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Dose</label>
              <input [(ngModel)]="form.dose" name="dose"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Route</label>
              <select [(ngModel)]="form.route" name="route"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
                <option *ngFor="let r of routes" [value]="r">{{ r }}</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Scheduled time</label>
            <input [(ngModel)]="form.scheduled_time" name="scheduled_time" placeholder="e.g. 08:00, 14:00, 20:00"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Adding…' : 'Add entry' }}
          </button>
        </form>

        <div class="xl:col-span-3 bg-white border border-line-1 rounded-card overflow-hidden">
          <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm">Today's MAR</div>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                <th class="px-4 py-2 font-medium">Patient</th>
                <th class="px-4 py-2 font-medium">Drug</th>
                <th class="px-4 py-2 font-medium">Time</th>
                <th class="px-4 py-2 font-medium">Status</th>
                <th class="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngIf="!entries.loading() && entries.data().length === 0">
                <td colspan="5" class="px-4 py-6 text-center text-body-2">No MAR entries yet.</td>
              </tr>
              <tr *ngFor="let e of entries.data()" class="border-b border-line-2 last:border-0">
                <td class="px-4 py-2">
                  <div class="font-medium text-ink-2">{{ e.patient }}</div>
                  <div class="text-[11.5px] text-muted-1">{{ e.ward || '—' }}</div>
                </td>
                <td class="px-4 py-2">
                  <div class="text-body-1">{{ e.drug }}</div>
                  <div class="text-[11.5px] text-muted-1">{{ e.dose }} · {{ e.route }}</div>
                </td>
                <td class="px-4 py-2 font-mono text-body-1">{{ e.scheduled_time || '—' }}</td>
                <td class="px-4 py-2">
                  <span class="px-2 py-0.5 rounded-pill text-[11.5px] font-medium" [class]="statusStyle(e.status)">{{ e.status }}</span>
                </td>
                <td class="px-4 py-2 text-right" *ngIf="e.status === 'Due'">
                  <button (click)="mark(e, 'Given')" class="text-[12px] font-semibold text-success-fg hover:underline mr-2">Given</button>
                  <button (click)="mark(e, 'Held')" class="text-[12px] font-semibold text-body-1 hover:underline mr-2">Hold</button>
                  <button (click)="mark(e, 'Missed')" class="text-[12px] font-semibold text-danger-fg hover:underline">Missed</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class NursingComponent implements OnDestroy {
  routes = ROUTES;
  form: MarForm = emptyForm();
  submitting = false;
  errorMsg = '';

  entries: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.entries = this.realtime.watch('nursing_mar', (q) => q.order('created_at', { ascending: false }));
  }

  statusStyle(status: string) {
    return STATUS_STYLE[status] ?? STATUS_STYLE['Due'];
  }

  async createEntry() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('nursing_mar').insert({
        patient: this.form.patient,
        mrn: this.form.mrn,
        ward: this.form.ward,
        drug: this.form.drug,
        dose: this.form.dose,
        route: this.form.route,
        scheduled_time: this.form.scheduled_time,
        status: 'Due',
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.entries.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async mark(entry: any, status: string) {
    const patch: any = { status };
    if (status === 'Given') {
      patch.given_at = new Date().toISOString();
    }
    const { error } = await this.supabaseService.client.from('nursing_mar').update(patch).eq('id', entry.id);
    if (error) console.error(error);
  }

  ngOnDestroy() {
    this.entries.dispose();
  }
}
