import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { tint } from '../core/tint';

export interface KpiItem {
  label: string;
  value: string;
  icon: string;
  tintKey: string;
}

@Component({
  selector: 'app-kpi-row',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="grid gap-[14px] mb-[18px]" style="grid-template-columns:repeat(auto-fit,minmax(176px,1fr))">
      <div *ngFor="let k of items" class="bg-white border border-[#e7ecf2] rounded-[14px] p-[15px_16px]">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] font-semibold tracking-[.4px] text-[#7d92a4] uppercase">{{ k.label }}</span>
          <span class="w-8 h-8 rounded-[9px] flex items-center justify-center flex-none" [style.background]="tint(k.tintKey).bg">
            <i class="ph {{ k.icon }} text-[17px]" [style.color]="tint(k.tintKey).fg"></i>
          </span>
        </div>
        <div class="flex items-baseline gap-2 mt-[10px]">
          <span class="font-mono font-semibold text-[25px] text-[#12303f]">{{ k.value }}</span>
        </div>
      </div>
    </div>
  `,
})
export class KpiRowComponent {
  @Input() items: KpiItem[] = [];
  tint = tint;
}
