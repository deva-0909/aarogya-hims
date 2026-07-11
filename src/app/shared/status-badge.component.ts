import { Component, Input } from '@angular/core';

const STYLES: Record<string, string> = {
  waiting: 'bg-warning-bg text-warning-fg',
  called: 'bg-info-bg text-info-fg',
  'in consultation': 'bg-progress-bg text-progress-fg',
  completed: 'bg-success-bg text-success-fg',
  billing: 'bg-info-bg text-info-fg',
  available: 'bg-success-bg text-success-fg',
  occupied: 'bg-danger-bg text-danger-fg',
  reserved: 'bg-warning-bg text-warning-fg',
  cleaning: 'bg-line-2 text-body-2',
  unpaid: 'bg-danger-bg text-danger-fg',
  partial: 'bg-warning-bg text-warning-fg',
  paid: 'bg-success-bg text-success-fg',
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `
    <span class="inline-block px-2.5 py-0.5 rounded-pill text-[11.5px] font-medium" [class]="cls">
      {{ status }}
    </span>
  `,
})
export class StatusBadgeComponent {
  @Input() status = '';

  get cls(): string {
    return STYLES[this.status?.toLowerCase()] ?? 'bg-line-2 text-body-2';
  }
}
