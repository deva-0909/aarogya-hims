import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

const TYPES = ['Health Camp', 'Press Release', 'Social Media', 'Community Event'];
const STATUS_STYLE: Record<string, string> = {
  Planned: 'bg-line-2 text-body-1',
  Active: 'bg-info-bg text-info-fg',
  Completed: 'bg-success-bg text-success-fg',
};

interface CampaignForm {
  title: string; type: string; start_date: string; end_date: string; notes: string;
}
const emptyForm = (): CampaignForm => ({ title: '', type: TYPES[0], start_date: '', end_date: '', notes: '' });

@Component({
  selector: 'app-pr-marketing',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>


      <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <form (ngSubmit)="createCampaign()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">New Campaign</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Title</label>
            <input required [(ngModel)]="form.title" name="title" placeholder="e.g. Free Diabetes Screening Camp"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Type</label>
            <select [(ngModel)]="form.type" name="type"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let t of types" [value]="t">{{ t }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Start</label>
              <input type="date" [(ngModel)]="form.start_date" name="start_date"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">End</label>
              <input type="date" [(ngModel)]="form.end_date" name="end_date"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Notes</label>
            <textarea [(ngModel)]="form.notes" name="notes" rows="3"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand"></textarea>
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Creating…' : 'Create campaign' }}
          </button>
        </form>

        <div class="xl:col-span-2 bg-white border border-line-1 rounded-card overflow-hidden">
          <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm">Campaigns</div>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                <th class="px-4 py-2 font-medium">Campaign</th>
                <th class="px-4 py-2 font-medium">Dates</th>
                <th class="px-4 py-2 font-medium">Status</th>
                <th class="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngIf="!campaigns.loading() && campaigns.data().length === 0">
                <td colspan="4" class="px-4 py-6 text-center text-body-2">No campaigns yet.</td>
              </tr>
              <tr *ngFor="let c of campaigns.data()" class="border-b border-line-2 last:border-0">
                <td class="px-4 py-2">
                  <div class="font-medium text-ink-2">{{ c.title }}</div>
                  <div class="text-[11.5px] text-muted-1">{{ c.type }}</div>
                </td>
                <td class="px-4 py-2 text-[12.5px] font-mono text-body-1">{{ c.start_date || '—' }} → {{ c.end_date || '—' }}</td>
                <td class="px-4 py-2">
                  <span class="px-2 py-0.5 rounded-pill text-[11.5px] font-medium" [class]="statusStyle(c.status)">{{ c.status }}</span>
                </td>
                <td class="px-4 py-2 text-right">
                  <button *ngIf="c.status === 'Planned'" (click)="setStatus(c, 'Active')" class="text-[12px] font-semibold text-info-fg hover:underline">Activate</button>
                  <button *ngIf="c.status === 'Active'" (click)="setStatus(c, 'Completed')" class="text-[12px] font-semibold text-success-fg hover:underline">Complete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class PrMarketingComponent implements OnDestroy {
  types = TYPES;
  form: CampaignForm = emptyForm();
  submitting = false;
  errorMsg = '';

  campaigns: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.campaigns = this.realtime.watch('pr_campaigns', (q) => q.order('created_at', { ascending: false }));
  }

  // Matches the reference's "Active Campaigns" and "Events Upcoming"
  // exactly. "Feedback NPS" and "Reach (30d)" in the reference need survey
  // and analytics integrations we don't have -- replaced with real
  // Planned/Completed counts instead of fabricating engagement numbers.
  kpis(): KpiItem[] {
    const all = this.campaigns.data();
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = all.filter((c: any) => c.status === 'Planned' && c.start_date && c.start_date >= today);
    return [
      { label: 'Active Campaigns', value: String(all.filter((c: any) => c.status === 'Active').length), icon: 'ph-megaphone', tintKey: 'teal' },
      { label: 'Planned', value: String(all.filter((c: any) => c.status === 'Planned').length), icon: 'ph-clipboard-text', tintKey: 'indigo' },
      { label: 'Events Upcoming', value: String(upcoming.length), icon: 'ph-calendar-star', tintKey: 'blue' },
      { label: 'Completed', value: String(all.filter((c: any) => c.status === 'Completed').length), icon: 'ph-check-circle', tintKey: 'green' },
    ];
  }

  statusStyle(status: string) {
    return STATUS_STYLE[status] ?? STATUS_STYLE['Planned'];
  }

  async createCampaign() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('pr_campaigns').insert({
        title: this.form.title,
        type: this.form.type,
        start_date: this.form.start_date || null,
        end_date: this.form.end_date || null,
        notes: this.form.notes,
        status: 'Planned',
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.campaigns.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async setStatus(campaign: any, status: string) {
    const { error } = await this.supabaseService.client.from('pr_campaigns').update({ status }).eq('id', campaign.id);
    if (error) console.error(error);
  }

  ngOnDestroy() {
    this.campaigns.dispose();
  }
}
