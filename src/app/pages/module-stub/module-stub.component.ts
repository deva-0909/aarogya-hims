import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MODULES } from '../../core/modules';

@Component({
  selector: 'app-module-stub',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-2xl">
      <div class="flex items-center gap-3 mb-2">
        <i class="ph {{ mod()?.icon ?? 'ph-cube' }} text-2xl text-brand"></i>
        <h1 class="text-xl font-semibold text-ink-1">{{ mod()?.name ?? 'Module' }}</h1>
      </div>
      <div class="bg-white border border-line-1 rounded-card p-5 text-sm text-body-1 leading-relaxed">
        This module isn't wired up to Supabase yet. Front Office, OPD, IPD, and
        Billing are fully implemented as a reference — follow the same pattern
        (table + RLS policy + a page under
        <code class="font-mono text-[12.5px] bg-line-2 px-1 rounded">src/app/pages/</code>)
        to bring this one online. See
        <code class="font-mono text-[12.5px] bg-line-2 px-1 rounded">supabase/schema.sql</code>
        for the suggested table for this module.
      </div>
    </div>
  `,
})
export class ModuleStubComponent {
  private moduleId = computed(() => (this.route.snapshot.data['moduleId'] as number) ?? 0);
  mod = computed(() => MODULES.find((m) => m.id === this.moduleId()));

  constructor(private route: ActivatedRoute) {}
}
