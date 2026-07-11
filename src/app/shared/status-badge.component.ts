import { Component, Input } from '@angular/core';

// Exact PILL color map from the reference prototype (its `pill()` status
// helper) -- kept as literal hex rather than Tailwind's approximated
// warning/success/danger tokens, so badges match the source exactly.
const PILL: Record<string, { bg: string; fg: string }> = {
  waiting: { bg: '#fcefd8', fg: '#97600a' },
  called: { bg: '#e3edfb', fg: '#2257a3' },
  'in consultation': { bg: '#d9f1ee', fg: '#0a6a60' },
  billing: { bg: '#e7e7fb', fg: '#4b46a8' },
  completed: { bg: '#ddf1e3', fg: '#1d7a42' },
  queued: { bg: '#eaeef3', fg: '#51687d' },
  verifying: { bg: '#fcefd8', fg: '#97600a' },
  ready: { bg: '#e3edfb', fg: '#2257a3' },
  dispensed: { bg: '#ddf1e3', fg: '#1d7a42' },
  // Extended beyond the reference's OPD/Pharmacy-specific set to cover
  // every status label used across this app's 27 modules, in the same
  // visual language (amber=pending/waiting, blue=in-progress, green=done,
  // red=blocked/unpaid, grey=neutral).
  available: { bg: '#ddf1e3', fg: '#1d7a42' },
  occupied: { bg: '#fbe3e3', fg: '#b42318' },
  reserved: { bg: '#fcefd8', fg: '#97600a' },
  cleaning: { bg: '#eef1f4', fg: '#6b7d8f' },
  unpaid: { bg: '#fbe3e3', fg: '#b42318' },
  partial: { bg: '#fcefd8', fg: '#97600a' },
  paid: { bg: '#ddf1e3', fg: '#1d7a42' },
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `
    <span
      class="inline-block px-2.5 py-0.5 rounded-pill text-[11px] font-semibold"
      [style.background]="color().bg"
      [style.color]="color().fg"
    >
      {{ status }}
    </span>
  `,
})
export class StatusBadgeComponent {
  @Input() status = '';

  color() {
    return PILL[this.status?.toLowerCase()] ?? { bg: '#eaeef3', fg: '#51687d' };
  }
}
