import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

const STAGES = ['Pre-Auth', 'Submitted', 'Query', 'Approved', 'Settled'];
const NEXT_STAGE: Record<string, string> = {
  'Pre-Auth': 'Submitted',
  Submitted: 'Query',
  Query: 'Approved',
  Approved: 'Settled',
};
const STAGE_STYLE: Record<string, string> = {
  'Pre-Auth': 'bg-line-2 text-body-1',
  Submitted: 'bg-info-bg text-info-fg',
  Query: 'bg-warning-bg text-warning-fg',
  Approved: 'bg-success-bg text-success-fg',
  Settled: 'bg-success-bg text-success-fg',
  Rejected: 'bg-danger-bg text-danger-fg',
};

interface ClaimForm {
  patient: string; mrn: string; insurer: string; policy_no: string; tpa: string;
  sum_insured: string; claim_amount: string; procedure: string;
}
const emptyForm = (): ClaimForm => ({
  patient: '', mrn: '', insurer: '', policy_no: '', tpa: '', sum_insured: '', claim_amount: '', procedure: '',
});

@Component({
  selector: 'app-insurance',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-6">
        <form (ngSubmit)="createClaim()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">New Claim</h2>

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
              <label class="block text-xs font-medium text-body-1 mb-1">Policy no.</label>
              <input [(ngModel)]="form.policy_no" name="policy_no"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Insurer</label>
              <input required [(ngModel)]="form.insurer" name="insurer" placeholder="e.g. Star Health"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">TPA</label>
              <input [(ngModel)]="form.tpa" name="tpa" placeholder="e.g. MediAssist"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Procedure / reason</label>
            <input required [(ngModel)]="form.procedure" name="procedure"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Sum insured (₹)</label>
              <input type="number" [(ngModel)]="form.sum_insured" name="sum_insured"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Claim amount (₹)</label>
              <input required type="number" [(ngModel)]="form.claim_amount" name="claim_amount"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Submitting…' : 'Raise claim' }}
          </button>
        </form>

        <div class="xl:col-span-2 bg-white border border-line-1 rounded-card overflow-hidden">
          <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm">Claims</div>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                <th class="px-4 py-2 font-medium">Patient</th>
                <th class="px-4 py-2 font-medium">Insurer / TPA</th>
                <th class="px-4 py-2 font-medium">Claim ₹</th>
                <th class="px-4 py-2 font-medium">Stage</th>
                <th class="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngIf="!claims.loading() && claims.data().length === 0">
                <td colspan="5" class="px-4 py-6 text-center text-body-2">No claims yet.</td>
              </tr>
              <tr *ngFor="let c of claims.data()" class="border-b border-line-2 last:border-0 align-top cursor-pointer hover:bg-line-2/40" (click)="openThread(c)">
                <td class="px-4 py-2">
                  <div class="font-medium text-ink-2">{{ c.patient }}</div>
                  <div class="text-[11.5px] text-muted-1">{{ c.procedure }}</div>
                </td>
                <td class="px-4 py-2">
                  <div class="text-body-1">{{ c.insurer }}</div>
                  <div class="text-[11.5px] text-muted-1">{{ c.tpa || '—' }}</div>
                </td>
                <td class="px-4 py-2 font-mono">₹{{ c.claim_amount | number }}</td>
                <td class="px-4 py-2">
                  <span class="px-2 py-0.5 rounded-pill text-[11.5px] font-medium" [class]="stageStyle(c.stage)">{{ c.stage }}</span>
                </td>
                <td class="px-4 py-2 text-right" (click)="$event.stopPropagation()">
                  <button *ngIf="nextStage(c.stage)" (click)="advance(c)"
                    class="text-[12px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] px-3 py-1.5">
                    Move to {{ nextStage(c.stage) }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TPA correspondence thread -->
      <div *ngIf="threadClaim" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="threadClaim = null">
        <div (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-lg space-y-3 max-h-[80vh] flex flex-col">
          <h3 class="font-semibold text-ink-2">TPA thread — {{ threadClaim.patient }}</h3>
          <div class="flex-1 overflow-y-auto space-y-2 border border-line-1 rounded-[9px] p-3 min-h-[120px]">
            <div *ngIf="!threadClaim.tpa_thread || threadClaim.tpa_thread.length === 0" class="text-body-2 text-sm text-center py-4">
              No correspondence yet.
            </div>
            <div *ngFor="let msg of threadClaim.tpa_thread" class="border border-line-1 rounded-[8px] p-2">
              <div class="text-[11px] text-muted-1 mb-0.5">{{ msg.at | date: 'short' }}</div>
              <div class="text-sm text-ink-2">{{ msg.note }}</div>
            </div>
          </div>
          <form (ngSubmit)="addThreadNote()" class="flex gap-2">
            <input [(ngModel)]="threadNote" name="threadNote" placeholder="Add a note…"
              class="flex-1 border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            <button type="submit" class="bg-brand hover:bg-brand-hover text-white rounded-[9px] px-4 text-sm font-semibold">Add</button>
          </form>
          <button type="button" (click)="threadClaim = null" class="border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Close</button>
        </div>
      </div>
    </div>
  `,
})
export class InsuranceComponent implements OnDestroy {
  stages = STAGES;
  form: ClaimForm = emptyForm();
  submitting = false;
  errorMsg = '';

  threadClaim: any = null;
  threadNote = '';

  claims: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.claims = this.realtime.watch('insurance_claims', (q) => q.order('created_at', { ascending: false }));
  }

  nextStage(stage: string) {
    return NEXT_STAGE[stage ?? 'Pre-Auth'];
  }

  // Matches the reference's Insurance KPI row exactly (Active Claims /
  // Approval Rate / Rejected / Total Sanctioned).
  kpis(): KpiItem[] {
    const all = this.claims.data();
    const approved = all.filter((c: any) => c.stage === 'Approved' || c.stage === 'Settled').length;
    const rejected = all.filter((c: any) => c.stage === 'Rejected').length;
    const pending = all.filter((c: any) => !['Settled', 'Rejected'].includes(c.stage)).length;
    const approvalRate = all.length ? Math.round((approved / all.length) * 100) : 0;
    const totalSanctioned = all.reduce((sum: number, c: any) => sum + Number(c.approved_amount || 0), 0);

    return [
      { label: 'Active Claims', value: String(pending), icon: 'ph-clipboard-text', tintKey: 'blue' },
      { label: 'Approval Rate', value: approvalRate + '%', icon: 'ph-check-circle', tintKey: 'green' },
      { label: 'Rejected', value: String(rejected), icon: 'ph-x-circle', tintKey: 'red' },
      { label: 'Total Sanctioned', value: '\u20b9' + totalSanctioned.toLocaleString('en-IN'), icon: 'ph-currency-circle-dollar', tintKey: 'teal' },
    ];
  }

  stageStyle(stage: string) {
    return STAGE_STYLE[stage] ?? STAGE_STYLE['Pre-Auth'];
  }

  async createClaim() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('insurance_claims').insert({
        patient: this.form.patient,
        mrn: this.form.mrn,
        insurer: this.form.insurer,
        policy_no: this.form.policy_no,
        tpa: this.form.tpa,
        sum_insured: this.form.sum_insured ? Number(this.form.sum_insured) : null,
        claim_amount: Number(this.form.claim_amount),
        procedure: this.form.procedure,
        stage: 'Pre-Auth',
        tpa_thread: [],
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.claims.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async advance(claim: any) {
    const next = NEXT_STAGE[claim.stage ?? 'Pre-Auth'];
    if (!next) return;
    const patch: any = { stage: next };
    if (next === 'Approved') patch.approved_amount = claim.claim_amount;
    const { error } = await this.supabaseService.client.from('insurance_claims').update(patch).eq('id', claim.id);
    if (error) console.error(error);
  }

  openThread(claim: any) {
    this.threadClaim = claim;
    this.threadNote = '';
  }

  async addThreadNote() {
    if (!this.threadClaim || !this.threadNote.trim()) return;
    const existing = Array.isArray(this.threadClaim.tpa_thread) ? this.threadClaim.tpa_thread : [];
    const updated = [...existing, { note: this.threadNote, at: new Date().toISOString() }];
    const { error } = await this.supabaseService.client
      .from('insurance_claims')
      .update({ tpa_thread: updated })
      .eq('id', this.threadClaim.id);
    if (error) {
      alert(error.message);
      return;
    }
    this.threadClaim = { ...this.threadClaim, tpa_thread: updated };
    this.threadNote = '';
    await this.claims.refresh();
  }

  ngOnDestroy() {
    this.claims.dispose();
  }
}
