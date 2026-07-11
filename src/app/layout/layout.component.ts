import { Component, computed, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { RoleService } from '../core/role.service';
import { groupedModulesForRole, roleLabel, routeFor, ROLES } from '../core/modules';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex h-screen w-full bg-line-2 text-ink-2 text-sm overflow-hidden">
      <!-- Sidebar -->
      <aside class="w-[250px] flex-none bg-brand-dark flex flex-col h-full">
        <div class="px-[18px] pt-[17px] pb-[14px] flex items-center gap-[11px] border-b border-white/[.07]">
          <div class="w-[34px] h-[34px] rounded-[9px] bg-gradient-to-br from-brand to-[#36c3b4] flex items-center justify-center flex-none">
            <i class="ph ph-pulse text-white text-xl"></i>
          </div>
          <div class="min-w-0">
            <div class="font-bold text-[15px] text-[#f3f8f7] tracking-[.2px]">Aarogya HIMS</div>
            <div class="text-[10px] text-[#6f8aa3] tracking-[.5px]">CITY GENERAL HOSPITAL</div>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto py-[10px] pb-[22px]">
          <div *ngFor="let group of groups()" class="mt-[14px]">
            <div class="px-[22px] pb-[5px] text-[10px] font-semibold tracking-[.9px] text-[#5f7c97]">
              {{ group[0].toUpperCase() }}
            </div>
            <a
              *ngFor="let item of group[1]"
              [routerLink]="['/', routeFor(item)]"
              routerLinkActive="border-brand bg-white/[.06] text-white font-medium"
              [routerLinkActiveOptions]="{ exact: false }"
              class="flex items-center gap-[11px] mx-[10px] my-[1px] px-3 py-2 rounded-[9px] cursor-pointer text-[13px] border-l-[3px] border-transparent text-[#a9bccb] hover:bg-white/[.06]"
            >
              <i class="ph {{ item.icon }} text-[17px] flex-none"></i>
              <span>{{ item.name }}</span>
            </a>
          </div>
        </div>

        <div class="px-4 py-3 border-t border-white/[.07] text-[10.5px] text-[#6f8aa3]">
          <div class="flex items-center gap-1.5">
            <i class="ph ph-info text-[13px]"></i>
            Demo mode — no login, role-only
          </div>
        </div>
      </aside>

      <!-- Main column -->
      <div class="flex-1 flex flex-col h-full min-w-0">
        <header class="h-[52px] flex-none bg-white border-b border-[#e2e8ee] flex items-center gap-4 px-[22px]">
          <div class="text-[12.5px] text-[#6b8196] font-medium">Aarogya HIMS · Live</div>
          <div class="flex-1"></div>
          <div class="text-right leading-[1.15]">
            <div class="font-mono font-semibold text-[13px] text-[#14303f]">{{ clockTime() }}</div>
            <div class="text-[10.5px] text-muted-1">{{ clockDate() }}</div>
          </div>
        </header>

        <!-- Role tab bar: this is the whole "login" -- pick who you're acting as -->
        <div class="h-[46px] flex-none bg-white border-b border-[#e2e8ee] flex items-center gap-1 px-[14px] overflow-x-auto">
          <span class="text-[11px] font-semibold text-muted-1 mr-1 flex-none">VIEWING AS</span>
          <button
            *ngFor="let r of roleKeys"
            (click)="setRole(r)"
            class="flex-none px-3 py-1.5 rounded-pill text-[12.5px] font-medium whitespace-nowrap transition-colors"
            [class]="r === role() ? 'bg-brand text-white' : 'bg-line-2 text-body-1 hover:bg-line-1'"
          >
            {{ roleLabel(r) }}
          </button>
        </div>

        <main class="flex-1 overflow-y-auto p-6">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
})
export class LayoutComponent implements OnInit, OnDestroy {
  private clockTimer: any;
  private readonly now = signal(new Date());

  clockTime = computed(() => this.now().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  clockDate = computed(() => this.now().toLocaleDateString());

  role = computed(() => this.roleService.role());
  groups = computed(() => groupedModulesForRole(this.role()));

  roleKeys = Object.keys(ROLES);
  roleLabel = roleLabel;
  routeFor = routeFor;

  constructor(public roleService: RoleService) {}

  ngOnInit() {
    this.clockTimer = setInterval(() => this.now.set(new Date()), 30_000);
  }

  ngOnDestroy() {
    clearInterval(this.clockTimer);
  }

  setRole(role: string) {
    this.roleService.setRole(role);
  }
}
