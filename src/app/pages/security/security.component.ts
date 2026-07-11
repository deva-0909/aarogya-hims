import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';

interface VisitorForm {
  visitor_name: string; purpose: string; visiting: string; id_type: string;
}
const emptyForm = (): VisitorForm => ({ visitor_name: '', purpose: '', visiting: '', id_type: 'Aadhaar' });

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>
      <h1 class="text-xl font-semibold text-ink-1 mb-4">Security & Access Control</h1>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <form (ngSubmit)="checkIn()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">Visitor Check-In</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Visitor name</label>
            <input required [(ngModel)]="form.visitor_name" name="visitor_name"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Visiting (patient / ward / dept)</label>
            <input required [(ngModel)]="form.visiting" name="visiting"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Purpose</label>
            <input [(ngModel)]="form.purpose" name="purpose" placeholder="e.g. Family visit, delivery, vendor"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">ID type</label>
            <select [(ngModel)]="form.id_type" name="id_type"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option>Aadhaar</option>
              <option>Driving License</option>
              <option>Passport</option>
              <option>Employee ID</option>
              <option>Other</option>
            </select>
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Checking in…' : 'Check in' }}
          </button>
        </form>

        <div class="xl:col-span-2 bg-white border border-line-1 rounded-card overflow-hidden">
          <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm">
            On Premises ({{ onPremises().length }})
          </div>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                <th class="px-4 py-2 font-medium">Visitor</th>
                <th class="px-4 py-2 font-medium">Visiting</th>
                <th class="px-4 py-2 font-medium">Entry</th>
                <th class="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngIf="onPremises().length === 0">
                <td colspan="4" class="px-4 py-6 text-center text-body-2">No visitors currently on premises.</td>
              </tr>
              <tr *ngFor="let v of onPremises()" class="border-b border-line-2 last:border-0">
                <td class="px-4 py-2">
                  <div class="font-medium text-ink-2">{{ v.visitor_name }}</div>
                  <div class="text-[11.5px] text-muted-1">{{ v.purpose || '—' }}</div>
                </td>
                <td class="px-4 py-2 text-body-1">{{ v.visiting }}</td>
                <td class="px-4 py-2 text-[12.5px] font-mono text-body-1">{{ v.entry_time | date: 'shortTime' }}</td>
                <td class="px-4 py-2 text-right">
                  <button (click)="checkOut(v)" class="text-[12px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] px-3 py-1.5">
                    Check out
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class SecurityComponent implements OnDestroy {
  form: VisitorForm = emptyForm();
  submitting = false;
  errorMsg = '';

  log: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.log = this.realtime.watch('security_visitor_log', (q) => q.order('entry_time', { ascending: false }));
  }

  onPremises() {
    return this.log.data().filter((v: any) => v.status === 'Checked In');
  }

  async checkIn() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('security_visitor_log').insert({
        visitor_name: this.form.visitor_name,
        purpose: this.form.purpose,
        visiting: this.form.visiting,
        id_type: this.form.id_type,
        status: 'Checked In',
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.log.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async checkOut(visitor: any) {
    const { error } = await this.supabaseService.client
      .from('security_visitor_log')
      .update({ status: 'Checked Out', exit_time: new Date().toISOString() })
      .eq('id', visitor.id);
    if (error) console.error(error);
  }

  ngOnDestroy() {
    this.log.dispose();
  }
}
