import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Insurance / TPA'];

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

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent],
  template: `
    <div>
      <h1 class="text-xl font-semibold text-ink-1 mb-4">Billing & Finance</h1>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <form (ngSubmit)="createInvoice()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">New Invoice</h2>
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
          <button type="submit" [disabled]="busy"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ busy ? 'Creating…' : 'Create invoice' }}
          </button>
          <p class="text-[11.5px] text-muted-1">
            Additional line items, GST, and multi-item invoices are a natural next step — add rows to the
            <code class="font-mono bg-line-2 px-1 rounded mx-1">items</code> jsonb column per the schema.
          </p>
        </form>

        <div class="lg:col-span-2 bg-white border border-line-1 rounded-card overflow-hidden">
          <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm">Invoices</div>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                <th class="px-4 py-2 font-medium">Patient</th>
                <th class="px-4 py-2 font-medium">Total</th>
                <th class="px-4 py-2 font-medium">Paid</th>
                <th class="px-4 py-2 font-medium">Status</th>
                <th class="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngIf="invoices.loading()"><td colspan="5" class="px-4 py-6 text-center text-body-2">Loading…</td></tr>
              <tr *ngIf="!invoices.loading() && invoices.data().length === 0">
                <td colspan="5" class="px-4 py-6 text-center text-body-2">No invoices yet.</td>
              </tr>
              <tr *ngFor="let inv of invoices.data()" class="border-b border-line-2 last:border-0 align-top">
                <td class="px-4 py-2">
                  <div class="font-medium text-ink-2">{{ inv.patient }}</div>
                  <div class="text-[11.5px] text-muted-1">{{ inv.dept }} · {{ inv.mrn || '—' }}</div>
                </td>
                <td class="px-4 py-2 font-mono">₹{{ total(inv) | number }}</td>
                <td class="px-4 py-2 font-mono">₹{{ inv.paid | number }}</td>
                <td class="px-4 py-2"><app-status-badge [status]="inv.status"></app-status-badge></td>
                <td class="px-4 py-2 text-right">
                  <button
                    *ngIf="inv.status !== 'Paid'"
                    (click)="openPay(inv)"
                    class="text-[12px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] px-3 py-1.5"
                  >
                    Record payment
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

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
  form: InvoiceForm = emptyInvoiceForm();
  busy = false;
  errorMsg = '';

  payingInvoice: any = null;
  payAmount = '';
  payMode = PAYMENT_MODES[0];

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.invoices = this.realtime.watch('invoices', (q) => q.order('created_at', { ascending: false }));
  }

  total(inv: any) {
    return invoiceTotal(inv.items);
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
  }
}
