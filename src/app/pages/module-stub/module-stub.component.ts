import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

// Defensive fallback only -- every module in MODULES is 'live' with a real
// component wired into app.routes.ts's LIVE_PAGES map, so this should never
// actually render. Kept as a safety net for if a new module gets added to
// the registry before its page component exists. The icon/title/description
// header is rendered by the shell (LayoutComponent), not duplicated here.
@Component({
  selector: 'app-module-stub',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-2xl bg-white border border-line-1 rounded-card p-5 text-sm text-body-1 leading-relaxed">
      This module isn't wired up to Supabase yet. Follow the pattern used by the other 27 modules
      (table + RLS policy + a page under
      <code class="font-mono text-[12.5px] bg-line-2 px-1 rounded">src/app/pages/</code>)
      to bring it online.
    </div>
  `,
})
export class ModuleStubComponent {}
