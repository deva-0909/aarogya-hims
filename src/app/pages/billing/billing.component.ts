import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';
import { PrintLetterheadComponent } from '../../shared/print-letterhead.component';

const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Insurance / TPA'];
type BillTab = 'invoices' | 'payments' | 'analytics';

interface InvoiceForm {
  patient: string; mrn: string; dept: string; description: string; amount: string;
}
const emptyInvoiceForm = (): InvoiceForm => ({ patient: '', mrn: '', dept: '', description: '', amount: '' });

function invoiceTotal(items: any[]): number {
  return (items ?? []).reduce((sum, i) => sum + Number(i.amt || 0), 0);
}

function statusFor(total: number, paid: number): string {
  if (paid <= 0) return 'Unpaid';
  if (paid < total) return 'Partial';
  return 'Paid';
}

function shortId(id: string, prefix: string): string {
  return prefix + '-' + id.slice(0, 4).toUpperCase();
}

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent, KpiRowComponent, PrintLetterheadComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>

      <!-- Tab bar, matching the reference's 3-tab Billing view -->
      <div class="flex items-center gap-2 mb-[14px]">
        <button *ngFor="let t of tabs" (click)="activeTab = t.key"
          class="flex items-center gap-[7px] rounded-[9px] px-[15px] py-2 text-[12.5px] font-semibold"
          [style.background]="activeTab === t.key ? '#0d8c80' : '#fff'"
          [style.color]="activeTab === t.key ? '#fff' : '#52677b'"
          [style.border]="'1px solid ' + (activeTab === t.key ? '#0d8c80' : '#dde5ee')">
          <i class="ph {{ t.icon }} text-[15px]"></i>{{ t.label }}
        </button>
        <div class="flex-1"></div>
        <button (click)="showNewInvoice = true" class="bg-brand hover:bg-brand-hover text-white rounded-[9px] px-4 py-2 text-[12.5px] font-semibold">
          + New Invoice
        </button>
      </div>

      <!-- Invoices tab -->
      <div *ngIf="activeTab === 'invoices'" class="flex flex-col gap-3">
        <div *ngIf="invoices.data().length === 0" class="text-center text-body-2 text-sm py-8 bg-white border border-[#e7ecf2] rounded-[13px]">No invoices yet.</div>
        <div *ngFor="let inv of invoices.data()" class="bg-white border border-[#e7ecf2] rounded-[13px] px-[17px] py-[14px] flex items-center gap-[14px]">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-[9px] flex-wrap">
              <span class="font-mono font-semibold text-[12.5px] text-brand">{{ shortId(inv.id, 'INV') }}</span>
              <span class="font-semibold text-[#22384a]">{{ inv.patient }}</span>
              <app-status-badge [status]="inv.status"></app-status-badge>
            </div>
            <div class="text-[11.5px] text-[#8094a6] mt-[3px]">{{ inv.dept }} · {{ inv.created_at | date: 'mediumDate' }} · {{ inv.payer }}</div>
          </div>
          <div class="text-right flex-none">
            <div class="font-mono font-semibold text-[14px] text-[#12303f]">₹{{ total(inv) | number }}</div>
            <div class="text-[10.5px] text-[#9aabbb]">Paid ₹{{ inv.paid | number }} · Due ₹{{ (total(inv) - inv.paid) | number }}</div>
          </div>
          <button (click)="printInvoice(inv)"
            class="border border-line-1 bg-white hover:bg-line-2 rounded-[7px] px-3 py-[7px] text-[11.5px] font-semibold whitespace-nowrap text-body-1">
            <i class="ph ph-printer"></i> Print
          </button>
          <button *ngIf="inv.status !== 'Paid'" (click)="openPay(inv)"
            class="bg-[#eaf5f3] text-[#0a6a60] border border-[#c9e7e2] hover:bg-[#dff0ed] rounded-[7px] px-3 py-[7px] text-[11.5px] font-semibold whitespace-nowrap">
            Record Payment
          </button>
        </div>
      </div>

      <!-- Printable invoice, hidden on screen, shown only via @media print in styles.css -->
      <div *ngIf="printingInvoice" class="print-area hidden">
        <app-print-letterhead title="Invoice"></app-print-letterhead>
        <div style="display:flex; justify-content:space-between; margin-bottom:16px; font-size:13px;">
          <div>
            <div style="font-weight:600; color:#12303f;">{{ printingInvoice.patient }}</div>
            <div style="color:#5f7689;">{{ printingInvoice.mrn || '—' }} · {{ printingInvoice.dept }}</div>
          </div>
          <div style="text-align:right;">
            <div style="color:#5f7689;">Invoice {{ shortId(printingInvoice.id, 'INV') }}</div>
            <div style="color:#5f7689;">{{ printingInvoice.created_at | date: 'mediumDate' }}</div>
          </div>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:16px;">
          <thead>
            <tr style="border-bottom:1px solid #dde5ee; text-align:left; color:#7d92a4; font-size:11px; text-transform:uppercase;">
              <th style="padding:6px 0;">Description</th>
              <th style="padding:6px 0; text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of printingInvoice.items" style="border-bottom:1px solid #f1f4f8;">
              <td style="padding:8px 0;">{{ item.d }}</td>
              <td style="padding:8px 0; text-align:right; font-family:monospace;">₹{{ item.amt | number }}</td>
            </tr>
          </tbody>
        </table>
        <div style="display:flex; justify-content:flex-end;">
          <div style="width:220px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; padding:4px 0;">
              <span style="color:#5f7689;">Total</span>
              <span style="font-family:monospace; font-weight:600;">₹{{ total(printingInvoice) | number }}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:4px 0;">
              <span style="color:#5f7689;">Paid</span>
              <span style="font-family:monospace;">₹{{ printingInvoice.paid | number }}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:4px 0; border-top:1px solid #dde5ee; margin-top:4px;">
              <span style="color:#12303f; font-weight:600;">Due</span>
              <span style="font-family:monospace; font-weight:700;">₹{{ (total(printingInvoice) - printingInvoice.paid) | number }}</span>
            </div>
            <div style="margin-top:10px; font-size:11px; color:#8094a6;">Status: {{ printingInvoice.status }} · Payer: {{ printingInvoice.payer }}</div>
          </div>
        </div>
      </div>

      <!-- Payments tab -->
      <div *ngIf="activeTab === 'payments'" class="bg-white border border-[#e7ecf2] rounded-[14px] overflow-hidden">
        <div class="grid gap-2 px-4 py-[11px] bg-[#f7f9fb] border-b border-[#eef2f6] text-[10.5px] font-semibold tracking-[.4px] text-[#7d92a4] uppercase"
          style="grid-template-columns:96px 1.4fr 1.2fr 1fr 120px">
          <span>Receipt</span><span>Patient</span><span>Invoice</span><span>Mode</span><span>Amount</span>
        </div>
        <div *ngIf="payments.data().length === 0" class="text-center text-body-2 text-sm py-8">No payments recorded yet.</div>
        <div *ngFor="let p of payments.data()" class="grid gap-2 items-center px-4 py-[11px] border-b border-[#f1f4f8] text-[13px]"
          style="grid-template-columns:96px 1.4fr 1.2fr 1fr 120px">
          <span class="font-mono font-semibold text-[12px] text-brand">{{ shortId(p.id, 'RCP') }}</span>
          <span class="text-[#22384a] font-medium">{{ p.patient }}</span>
          <span class="text-[#5f7689] text-[12px]">{{ p.invoice_id ? shortId(p.invoice_id, 'INV') : '—' }}</span>
          <span class="text-[#3f566a] text-[12px]">{{ p.mode }} · {{ p.created_at | date: 'shortTime' }}</span>
          <span class="font-mono font-semibold text-[13px] text-[#12303f]">₹{{ p.amount | number }}</span>
        </div>
      </div>

      <!-- Analytics tab -->
      <div *ngIf="activeTab === 'analytics'" class="grid gap-[18px] items-start grid-cols-1 lg:[grid-template-columns:1fr_1fr]">
        <div class="bg-white border border-[#e7ecf2] rounded-[14px] p-[16px_18px]">
          <h3 class="m-0 mb-[10px] text-[14px] font-semibold text-[#1c3a4d]">Revenue by Department</h3>
          <div *ngIf="revenueByDept().length === 0" class="text-body-2 text-sm py-2">No invoice data yet.</div>
          <div *ngFor="let m of revenueByDept()" class="mb-[9px]">
            <div class="flex justify-between text-[12px] text-[#3f566a] mb-[3px]">
              <span>{{ m.dept }}</span>
              <span class="font-mono text-[#6b8196]">₹{{ m.rev | number }}</span>
            </div>
            <div class="h-[6px] bg-[#eaf3f1] rounded-[5px] overflow-hidden">
              <div class="h-full bg-brand" [style.width]="m.pct + '%'"></div>
            </div>
          </div>
        </div>
        <div class="bg-white border border-[#e7ecf2] rounded-[14px] p-[16px_18px]">
          <h3 class="m-0 mb-2 text-[14px] font-semibold text-[#1c3a4d]">Collection Audit Trail</h3>
          <div *ngIf="payments.data().length === 0" class="text-body-2 text-sm py-2">No payments recorded yet.</div>
          <div *ngFor="let p of recentPayments()" class="py-2 border-b border-[#f0f3f7] text-[12px] text-[#3f566a] font-mono">
            {{ p.created_at | date: 'short' }} · {{ shortId(p.id, 'RCP') }} · {{ p.patient }} · {{ p.mode }} · ₹{{ p.amount | number }}
          </div>
        </div>
      </div>

      <!-- New invoice modal -->
      <div *ngIf="showNewInvoice" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="showNewInvoice = false">
        <form (ngSubmit)="createInvoice()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-sm space-y-3">
          <h3 class="font-semibold text-ink-2">New Invoice</h3>
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
              <label class="block text-xs font-medium text-body-1 mb-1">Department</label>
              <input required [(ngModel)]="form.dept" name="dept"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Line item description</label>
            <input required [(ngModel)]="form.description" name="description" placeholder="OPD Consultation"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Amount (₹)</label>
            <input required type="number" min="0" [(ngModel)]="form.amount" name="amount"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="showNewInvoice = false" class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" [disabled]="busy" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold disabled:opacity-60">
              {{ busy ? 'Creating…' : 'Create' }}
            </button>
          </div>
        </form>
      </div>

      <!-- Record payment modal -->
      <div *ngIf="payingInvoice" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="payingInvoice = null">
        <form (ngSubmit)="recordPayment()" (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-sm space-y-3">
          <h3 class="font-semibold text-ink-2">Record payment — {{ payingInvoice.patient }}</h3>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Amount (₹)</label>
            <input required type="number" min="0" [(ngModel)]="payAmount" name="payAmount"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Mode</label>
            <select [(ngModel)]="payMode" name="payMode"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let m of paymentModes" [value]="m">{{ m }}</option>
            </select>
          </div>
          <div class="flex gap-2 pt-1">
            <button type="button" (click)="payingInvoice = null"
              class="flex-1 border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
            <button type="submit" class="flex-1 bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2 text-sm font-semibold">
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class BillingComponent implements OnDestroy {
  paymentModes = PAYMENT_MODES;
  invoices: RealtimeTableHandle<any>;
  payments: RealtimeTableHandle<any>;
  form: InvoiceForm = emptyInvoiceForm();
  busy = false;
  errorMsg = '';
  shortId = shortId;

  activeTab: BillTab = 'invoices';
  tabs: { key: BillTab; label: string; icon: string }[] = [
    { key: 'invoices', label: 'Invoices', icon: 'ph-receipt' },
    { key: 'payments', label: 'Payments', icon: 'ph-currency-circle-dollar' },
    { key: 'analytics', label: 'Analytics', icon: 'ph-chart-bar' },
  ];

  showNewInvoice = false;
  payingInvoice: any = null;
  payAmount = '';
  payMode = PAYMENT_MODES[0];

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.invoices = this.realtime.watch('invoices', (q) => q.order('created_at', { ascending: false }));
    this.payments = this.realtime.watch('payments', (q) => q.order('created_at', { ascending: false }));
  }

  printingInvoice: any = null;

  printInvoice(inv: any) {
    this.printingInvoice = inv;
    // Wait one tick so Angular renders the print-area content before the
    // browser's print dialog captures the page.
    setTimeout(() => {
      window.print();
      this.printingInvoice = null;
    }, 50);
  }

  total(inv: any) {
    return invoiceTotal(inv.items);
  }

  recentPayments() {
    return this.payments.data().slice(0, 10);
  }

  // Real revenue-by-department breakdown, replacing the reference's demo data.
  revenueByDept() {
    const all = this.invoices.data();
    const byDept = new Map<string, number>();
    for (const inv of all) {
      const dept = inv.dept || 'Other';
      byDept.set(dept, (byDept.get(dept) ?? 0) + this.total(inv));
    }
    const totalRev = all.reduce((sum: number, inv: any) => sum + this.total(inv), 0);
    return Array.from(byDept.entries())
      .map(([dept, rev]) => ({ dept, rev, pct: totalRev ? Math.round((rev / totalRev) * 100) : 0 }))
      .sort((a, b) => b.rev - a.rev);
  }

  // Matches the reference's Billing KPI row exactly (Billed Today /
  // Collected / Outstanding / Unpaid Invoices). "Billed Today" is date-
  // filtered here using real timestamps, an improvement on the reference's
  // demo data which doesn't distinguish by date.
  kpis(): KpiItem[] {
    const all = this.invoices.data();
    const todayStart = new Date().toISOString().slice(0, 10);
    const billedToday = all
      .filter((i: any) => (i.created_at ?? '').slice(0, 10) === todayStart)
      .reduce((sum: number, i: any) => sum + this.total(i), 0);
    const collected = all.reduce((sum: number, i: any) => sum + Number(i.paid || 0), 0);
    const outstanding = all.reduce((sum: number, i: any) => sum + (this.total(i) - Number(i.paid || 0)), 0);
    const unpaid = all.filter((i: any) => i.status !== 'Paid').length;

    return [
      { label: 'Billed Today', value: '\u20b9' + billedToday.toLocaleString('en-IN'), icon: 'ph-receipt', tintKey: 'teal' },
      { label: 'Collected', value: '\u20b9' + collected.toLocaleString('en-IN'), icon: 'ph-currency-circle-dollar', tintKey: 'green' },
      { label: 'Outstanding', value: '\u20b9' + outstanding.toLocaleString('en-IN'), icon: 'ph-hourglass-medium', tintKey: 'amber' },
      { label: 'Unpaid Invoices', value: String(unpaid), icon: 'ph-warning', tintKey: 'red' },
    ];
  }

  async createInvoice() {
    this.busy = true;
    this.errorMsg = '';
    try {
      const items = [{ d: this.form.description, amt: Number(this.form.amount) }];
      const { error } = await this.supabaseService.client.from('invoices').insert({
        patient: this.form.patient,
        mrn: this.form.mrn,
        dept: this.form.dept,
        items,
        paid: 0,
        payer: 'Cash',
        status: 'Unpaid',
      });
      if (error) throw error;
      this.form = emptyInvoiceForm();
      this.showNewInvoice = false;
      await this.invoices.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.busy = false;
    }
  }

  openPay(inv: any) {
    this.payingInvoice = inv;
    this.payAmount = String(this.total(inv) - inv.paid);
    this.payMode = PAYMENT_MODES[0];
  }

  async recordPayment() {
    const total = this.total(this.payingInvoice);
    const newPaid = Number(this.payingInvoice.paid) + Number(this.payAmount);
    const client = this.supabaseService.client;
    const { error: invErr } = await client
      .from('invoices')
      .update({ paid: newPaid, payer: this.payMode, status: statusFor(total, newPaid) })
      .eq('id', this.payingInvoice.id);
    if (invErr) {
      alert(invErr.message);
      return;
    }
    await client.from('payments').insert({
      invoice_id: this.payingInvoice.id,
      patient: this.payingInvoice.patient,
      mode: this.payMode,
      amount: Number(this.payAmount),
    });
    this.payingInvoice = null;
    this.payAmount = '';
    await this.invoices.refresh();
  }

  ngOnDestroy() {
    this.invoices.dispose();
    this.payments.dispose();
  }
}
