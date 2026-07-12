import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';
import { QrCodeComponent } from '../../shared/qr-code.component';
import { QrScannerComponent } from '../../shared/qr-scanner.component';

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

// Codes encode a simple prefixed string -- PATIENT:<mrn-or-name> and
// DRUG:<drug name> -- matched against the MAR entry being administered.
// This is the same "right patient, right medication" verification
// principle as real hospital barcode medication administration (BCMA)
// systems, built entirely with the browser's camera -- no scanner hardware.
function patientCode(entry: any): string {
  return 'PATIENT:' + (entry.mrn || entry.patient).trim().toUpperCase();
}
function drugCode(entry: any): string {
  return 'DRUG:' + (entry.drug || '').trim().toUpperCase();
}

type VerifyStep = 'patient' | 'drug' | null;

@Component({
  selector: 'app-nursing',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent, QrCodeComponent, QrScannerComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>

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
          <div class="px-5 py-3 border-b border-line-1 font-semibold text-ink-2 text-sm flex items-center justify-between">
            <span>Today's MAR</span>
            <span class="text-[11px] font-normal text-muted-1">Verified administration -- scan wristband + label</span>
          </div>
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
              <ng-container *ngFor="let e of entries.data()">
                <tr class="border-b border-line-2 last:border-0">
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
                  <td class="px-4 py-2 text-right whitespace-nowrap" *ngIf="e.status === 'Due'">
                    <button (click)="startVerify(e)" class="text-[12px] font-semibold text-brand hover:underline mr-2">Verify &amp; Give</button>
                    <button (click)="toggleCodes(e)" class="text-[12px] font-semibold text-body-1 hover:underline mr-2">Codes</button>
                    <button (click)="mark(e, 'Held')" class="text-[12px] font-semibold text-body-1 hover:underline mr-2">Hold</button>
                    <button (click)="mark(e, 'Missed')" class="text-[12px] font-semibold text-danger-fg hover:underline">Missed</button>
                  </td>
                  <td class="px-4 py-2" *ngIf="e.status !== 'Due'"></td>
                </tr>
                <tr *ngIf="codesOpenFor === e.id" class="border-b border-line-2 last:border-0 bg-line-2/40">
                  <td colspan="5" class="px-4 py-4">
                    <div class="text-[11px] text-muted-1 mb-2">
                      Demo-only: these represent the printed wristband and medication label a real ward would scan.
                      Open this page on a second device to test the scan flow against these codes.
                    </div>
                    <div class="flex gap-6">
                      <div class="text-center">
                        <app-qr-code [value]="patientCodeFor(e)" [size]="120"></app-qr-code>
                        <div class="text-[10.5px] text-muted-1 mt-1">Patient wristband</div>
                      </div>
                      <div class="text-center">
                        <app-qr-code [value]="drugCodeFor(e)" [size]="120"></app-qr-code>
                        <div class="text-[10.5px] text-muted-1 mt-1">Medication label</div>
                      </div>
                    </div>
                  </td>
                </tr>
              </ng-container>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Verify & Give: two-step scan (patient wristband, then medication label) -->
      <div *ngIf="verifyingEntry" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" (click)="cancelVerify()">
        <div (click)="$event.stopPropagation()" class="bg-white rounded-card p-5 w-full max-w-sm space-y-3">
          <h3 class="font-semibold text-ink-2">{{ verifyingEntry.patient }} — {{ verifyingEntry.drug }}</h3>

          <div class="flex items-center gap-2 text-[11.5px] font-medium">
            <span class="px-2 py-0.5 rounded-pill" [class]="verifyStep === 'patient' ? 'bg-brand text-white' : verifiedPatient ? 'bg-success-bg text-success-fg' : 'bg-line-2 text-body-1'">
              1. Patient
            </span>
            <i class="ph ph-arrow-right text-[12px] text-muted-1"></i>
            <span class="px-2 py-0.5 rounded-pill" [class]="verifyStep === 'drug' ? 'bg-brand text-white' : verifiedDrug ? 'bg-success-bg text-success-fg' : 'bg-line-2 text-body-1'">
              2. Medication
            </span>
          </div>

          <p class="text-[12.5px] text-body-1">
            {{ verifyStep === 'patient' ? 'Scan the patient\'s wristband to confirm identity.' : 'Scan the medication label to confirm the drug.' }}
          </p>

          <app-qr-scanner (scanned)="onScanned($event)"></app-qr-scanner>

          <div *ngIf="verifyError" class="text-[12px] text-danger-fg bg-danger-bg rounded-[7px] px-2.5 py-1.5">{{ verifyError }}</div>

          <button type="button" (click)="cancelVerify()" class="w-full border border-line-1 rounded-[9px] py-2 text-sm font-medium text-body-1">Cancel</button>
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
  codesOpenFor: string | null = null;

  verifyingEntry: any = null;
  verifyStep: VerifyStep = null;
  verifiedPatient = false;
  verifiedDrug = false;
  verifyError = '';

  patientCodeFor = patientCode;
  drugCodeFor = drugCode;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.entries = this.realtime.watch('nursing_mar', (q) => q.order('created_at', { ascending: false }));
  }

  // Matches the reference's Nursing KPI row for the first 2 cards exactly
  // (Meds Due, Med Compliance). The reference's "Tasks Due"/"Overdue" track
  // a separate nursing-tasks concept we don't model -- replaced with real
  // Given/Missed counts from the same MAR data instead.
  kpis(): KpiItem[] {
    const all = this.entries.data();
    const given = all.filter((e: any) => e.status === 'Given').length;
    const missed = all.filter((e: any) => e.status === 'Missed').length;
    const compliance = given + missed > 0 ? Math.round((given / (given + missed)) * 100) : 100;
    return [
      { label: 'Meds Due', value: String(all.filter((e: any) => e.status === 'Due').length), icon: 'ph-pill', tintKey: 'amber' },
      { label: 'Med Compliance', value: compliance + '%', icon: 'ph-check-circle', tintKey: 'teal' },
      { label: 'Given', value: String(given), icon: 'ph-list-checks', tintKey: 'blue' },
      { label: 'Missed', value: String(missed), icon: 'ph-clock-countdown', tintKey: 'red' },
    ];
  }

  statusStyle(status: string) {
    return STATUS_STYLE[status] ?? STATUS_STYLE['Due'];
  }

  toggleCodes(entry: any) {
    this.codesOpenFor = this.codesOpenFor === entry.id ? null : entry.id;
  }

  startVerify(entry: any) {
    this.verifyingEntry = entry;
    this.verifyStep = 'patient';
    this.verifiedPatient = false;
    this.verifiedDrug = false;
    this.verifyError = '';
  }

  cancelVerify() {
    this.verifyingEntry = null;
    this.verifyStep = null;
    this.verifyError = '';
  }

  // Fails closed: a mismatched scan never marks the dose as given -- it
  // just shows an error and lets the nurse rescan or cancel. This is the
  // same "right patient, right medication" check real BCMA systems perform
  // before administration.
  async onScanned(code: string) {
    if (!this.verifyingEntry) return;

    if (this.verifyStep === 'patient') {
      if (code === patientCode(this.verifyingEntry)) {
        this.verifiedPatient = true;
        this.verifyStep = 'drug';
        this.verifyError = '';
      } else {
        this.verifyError = 'That code does not match this patient. Scan the correct wristband.';
      }
      return;
    }

    if (this.verifyStep === 'drug') {
      if (code === drugCode(this.verifyingEntry)) {
        this.verifiedDrug = true;
        this.verifyError = '';
        await this.mark(this.verifyingEntry, 'Given');
        this.verifyingEntry = null;
        this.verifyStep = null;
      } else {
        this.verifyError = 'That code does not match this medication. Scan the correct label.';
      }
    }
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
