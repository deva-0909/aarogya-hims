import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-print-letterhead',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #0d8c80; padding-bottom:12px; margin-bottom:16px;">
      <div>
        <div style="font-size:18px; font-weight:700; color:#0d2235;">Aarogya HIMS</div>
        <div style="font-size:11px; color:#5f7689; letter-spacing:.3px;">CITY GENERAL HOSPITAL</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:13px; font-weight:600; color:#0d2235;">{{ title }}</div>
        <div style="font-size:10.5px; color:#8094a6;">Printed {{ printedAt }}</div>
      </div>
    </div>
  `,
})
export class PrintLetterheadComponent {
  @Input() title = '';
  printedAt = new Date().toLocaleString();
}
