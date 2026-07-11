import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

const NEXT_STAGE: Record<string, string> = {
  'Pre-Auth': 'Submitted',
  Submitted: 'Query',
  Query: 'Approved',
  Approved: 'Settled',
};

// Exact stage colors from the reference's INSST map.
const INSST: Record<string, { bg: string; fg: string }> = {
  'Pre-Auth': { bg: '#e4edfb', fg: '#2257a3' },
  Submitted: { bg: '#fdf0d8', fg: '#946200' },
  Query: { bg: '#fbe3e3', fg: '#b42318' },
  Approved: { bg: '#ece8fb', fg: '#5536c9' },
  Settled: { bg: '#dff1ef', fg: '#0b7d72' },
  Rejected: { bg: '#f1f4f8', fg: '#8093a6' },
};
const NEXT_LABEL: Record<string, string> = {
  'Pre-Auth': 'Submit',
  Submitted: 'Mark Approved',
  Query: 'Resolve Query',
  Approved: 'Settle',
};

type InsTab = 'claims' | 'analytics';

interface ClaimForm {
  patient: string; mrn: string; insurer: string; policy_no: string; tpa: string;
  sum_insured: string; claim_amount: string; procedure: string;
}
const emptyForm = (): ClaimForm => ({
  patient: '', mrn: '', insurer: '', policy_no: '', tpa: '', sum_insured: '', claim_amount: '', procedure: '',
});

function shortId(id: string): string {
  return 'CLM-' + id.slice(0, 4).toUpperCase();
}

@Component({
  selector: 'app-insurance',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>

      <!-- Tab bar, matching the reference's 2-tab Insurance view -->
      <div class="flex items-center gap-2 mb-[14px]">
        <button *ngFor="let t of tabs" (click)="activeTab = t.key"
          class="flex items-center gap-[7px] rounded-[9px] px-[15px] py-2 text-[12.5px] font-semibold"
          [style.background]="activeTab === t.key ? '#0d8c80' : '#fff'"
          [style.color]="activeTab === t.key ? '#fff' : '#52677b'"
          [style.border]="'1px solid ' + (activeTab === t.key ? '#0d8c80' : '#dde5ee')">
          <i class="ph {{ t.icon }} text-[15px]"></i>{{ t.label }}
        </button>
        <div class="flex-1"></div>
        <button (click)="showNewClaim = true" class="bg-brand hover:bg-brand-hover text-white rounded-[9px] px-4 py-2 text-[12.5px] font-semibold">
          + New Claim
        </button>
      </div>

      <!-- Claims tab -->
      <div *ngIf="activeTab === 'claims'" class="flex flex-col gap-3">
        <div *ngIf="claims.data().length === 0" class="text-center text-body-2 text-sm py-8 bg-white border border-[#e7ecf2] rounded-[13px]">No claims yet.</div>
        <div *ngFor="let c of claims.data()" (click)="openThread(c)" class="bg-white border border-[#e7ecf2] rounded-[13px] px-[17px] py-[15px] cursor-pointer hover:bg-[#f8fafc]">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="flex items-center gap-[9px]">
              <span class="font-mono font-semibold text-[12.5px] text-brand">{{ shortId(c.id) }}</span>
              <span class="font-semibold text-[#22384a]">{{ c.patient }}</span>
            </div>
            <span class="px-[10px] py-0.5 rounded-pill text-[11px] font-semibold" [style.background]="stageColor(c.stage).bg" [style.color]="stageColor(c.stage).fg">
              {{ c.stage }}
            </span>
          </div>
          <div class="text-[12px] text-[#5f7689] mt-[6px]">{{ c.procedure }} · {{ c.insurer }} ({{ c.policy_no || '—' }}) via {{ c.tpa || '—' }}</div>
          <div *ngIf="c.stage === 'Query'" class="mt-2 bg-[#fef8ed] border border-[#f4dfae] rounded-[8px] px-[11px] py-2 text-[12px] text-[#946200]">
            TPA query pending response
          </div>
          <div class="flex items-center justify-between mt-[11px]">
            <span class="font-mono font-semibold text-[13px] text-[#12303f]">₹{{ c.claim_amount | number }}</span>
            <button *ngIf="nextStage(c.stage)" (click)="advance(c); $event.stopPropagation()"
              class="bg-[#eaf5f3] text-[#0a6a60] border border-[#c9e7e2] hover:bg-[#dff0ed] rounded-[7px] px-3 py-[6px] text-[11.5px] font-semibold">
              {{ nextLabel(c.stage) }}
            </button>
          </div>
        </div>
      </div>

      <!-- Analytics tab -->
      <div *ngIf="activeTab === 'analytics'" class="bg-white border border-[#e7ecf2] rounded-[14px] p-[16px_18px] max-w-[560px]">
        <h3 class="m-0 mb-2 text-[14px] font-semibold text-[#1c3a4d]">Claims Analytics</h3>
        <div *ngFor="let m of analytics()" class="flex items-center justify-between py-[10px] border-b border-[#f0f3f7]">
          <div class="min-w-0">
            <div class="text-[12.5px] text-[#3f566a]">{{ m.label }}</div>
            <div class="text-[10.5px] text-[#9aabbb]">{{ m.note }}</div>
          </div>
          <span class="font-mono font-semibold text-[15px] text-[#12303f] flex-none">{{ m.value }}</span>
        </div>
      </div>

      <!-- New claim modal -->
      <div *ngIf="showNewClaim" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="showNewClaim = false">
        <form (ngSubmit)="createClaim()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-sm space-y-3 max-h-[85vh] overflow-y-auto">
          <h3 class="font-semibold text-ink-2">New Claim</h3>
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
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="showNewClaim = false" class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" [disabled]="submitting" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold disabled:opacity-60">
              {{ submitting ? 'Submitting…' : 'Raise claim' }}
            </button>
          </div>
        </form>
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
  form: ClaimForm = emptyForm();
  submitting = false;
  errorMsg = '';
  shortId = shortId;

  activeTab: InsTab = 'claims';
  tabs: { key: InsTab; label: string; icon: string }[] = [
    { key: 'claims', label: 'Claims', icon: 'ph-clipboard-text' },
    { key: 'analytics', label: 'Analytics', icon: 'ph-chart-bar' },
  ];
  showNewClaim = false;

  threadClaim: any = null;
  threadNote = '';

  claims: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.claims = this.realtime.watch('insurance_claims', (q) => q.order('created_at', { ascending: false }));
  }

  nextStage(stage: string) {
    return NEXT_STAGE[stage ?? 'Pre-Auth'];
  }

  nextLabel(stage: string) {
    return NEXT_LABEL[stage] ?? 'Advance';
  }

  stageColor(stage: string) {
    return INSST[stage] ?? INSST['Pre-Auth'];
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

  // Matches the reference's Claims Analytics panel structure; "Avg claim
  // TAT" and "Rejection reasons" in the reference are static demo text (no
  // real timestamps-per-stage or rejection-reason field to compute from) --
  // replaced with real aggregates instead of copying fake text.
  analytics(): { label: string; value: string; note: string }[] {
    const all = this.claims.data();
    const approvalRate = this.kpis()[1].value;
    const totalClaimed = all.reduce((sum: number, c: any) => sum + Number(c.claim_amount || 0), 0);
    const totalSanctioned = all.reduce((sum: number, c: any) => sum + Number(c.approved_amount || 0), 0);
    const sanctionRatio = totalClaimed ? Math.round((totalSanctioned / totalClaimed) * 100) + '%' : '—';
    const inQuery = all.filter((c: any) => c.stage === 'Query').length;

    return [
      { label: 'Total claims', value: String(all.length), note: 'All time' },
      { label: 'Approval rate', value: approvalRate, note: 'Approved+Settled / total' },
      { label: 'Claims with open query', value: String(inQuery), note: 'Awaiting your response to TPA' },
      { label: 'Avg sanctioned vs claimed', value: sanctionRatio, note: 'Across all claims with a sanctioned amount' },
    ];
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
      this.showNewClaim = false;
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
