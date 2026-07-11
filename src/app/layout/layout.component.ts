import { Component, computed, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs/operators';
import { RoleService } from '../core/role.service';
import { SupabaseService } from '../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../core/realtime-table.service';
import { groupedModulesForRole, roleLabel, roleTitle, routeFor, moduleByRoute, ROLES } from '../core/modules';

interface NotificationItem {
  severity: 'critical' | 'warning';
  text: string;
  route: string;
  icon: string;
}

interface PatientResult {
  id: string;
  name: string;
  mrn: string;
  status: string;
  dept: string;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive],
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
        <header class="h-[60px] flex-none bg-white border-b border-[#e2e8ee] flex items-center gap-4 px-[22px] relative z-30">
          <div class="text-[12.5px] text-[#6b8196] font-medium flex-none">{{ breadcrumb() }}</div>
          <div class="flex-1"></div>

          <!-- Global patient search -->
          <div class="relative w-[340px] max-w-[32vw]">
            <div class="flex items-center gap-2 bg-[#f1f4f8] border border-[#e2e8ee] rounded-[9px] px-[11px] py-[7px]">
              <i class="ph ph-magnifying-glass text-[#8aa0b4] text-[16px]"></i>
              <input
                [(ngModel)]="searchQuery"
                (ngModelChange)="onSearchChange($event)"
                (focus)="searchOpen = true"
                placeholder="Search patients by name or MRN…"
                class="border-none bg-transparent outline-none flex-1 text-[13px] text-[#14303f] min-w-0"
              />
            </div>
            <div
              *ngIf="searchOpen && searchQuery.length > 0"
              class="absolute top-[46px] left-0 right-0 bg-white border border-[#e2e8ee] rounded-xl shadow-[0_14px_34px_rgba(18,40,55,.18)] p-1.5 z-40 max-h-[380px] overflow-y-auto"
            >
              <div class="flex items-center justify-between px-2.5 pt-1.5 pb-1">
                <span class="text-[10px] font-bold tracking-[.6px] text-[#8aa0b4] uppercase">Patients</span>
                <span class="text-[11px] text-[#9aabbb]">{{ searchResults.length }} found</span>
              </div>
              <div *ngIf="searchLoading" class="text-center text-[12.5px] text-[#9aabbb] py-4">Searching…</div>
              <div
                *ngFor="let p of searchResults"
                class="flex items-center gap-[11px] px-2.5 py-2 rounded-[9px] cursor-pointer hover:bg-[#f1f4f8]"
              >
                <span class="w-[34px] h-[34px] rounded-full bg-[#e9eff6] flex items-center justify-center text-[12px] font-semibold text-[#3f6087] flex-none">
                  {{ initials(p.name) }}
                </span>
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] font-semibold text-[#22384a]">{{ p.name }}</div>
                  <div class="text-[11.5px] text-[#8094a6] truncate">{{ p.dept }}</div>
                </div>
                <div class="text-right flex-none">
                  <div class="font-mono text-[11px] font-semibold text-[#5f7689]">{{ p.mrn }}</div>
                  <div class="text-[10.5px] text-[#9aabbb]">{{ p.status }}</div>
                </div>
              </div>
              <div *ngIf="!searchLoading && searchQuery.length > 0 && searchResults.length === 0" class="text-center text-[12.5px] text-[#9aabbb] py-4.5">
                No patients match that search.
              </div>
            </div>
          </div>

          <div class="flex items-center gap-[9px] flex-none">
            <span class="w-2 h-2 rounded-full bg-[#1d9a57] flex-none animate-pulse"></span>
            <div class="text-right leading-[1.15]">
              <div class="font-mono font-semibold text-[13px] text-[#14303f]">{{ clockTime() }}</div>
              <div class="text-[10.5px] text-muted-1">{{ clockDate() }}</div>
            </div>
          </div>

          <!-- Notification bell -- live-computed, not stored. Only ever
               shows what's true right now (critical lab/imaging results,
               low blood stock, ED patients waiting too long, aging STAT
               prescriptions), so it can never accumulate stale alerts the
               way a stored notifications table would. -->
          <div class="relative flex-none">
            <button
              (click)="notifMenuOpen = !notifMenuOpen; roleMenuOpen = false"
              class="relative w-[38px] h-[38px] rounded-[9px] border border-[#e2e8ee] bg-white flex items-center justify-center hover:bg-[#f7f9fb]"
            >
              <i class="ph ph-bell text-[18px] text-[#52677b]"></i>
              <span *ngIf="notifications().length > 0" class="absolute top-[7px] right-2 w-[7px] h-[7px] rounded-full bg-[#d64545]"></span>
            </button>
            <div
              *ngIf="notifMenuOpen"
              class="absolute top-[48px] right-0 w-[320px] bg-white border border-[#e2e8ee] rounded-xl shadow-[0_12px_30px_rgba(18,40,55,.16)] p-1.5 z-40 max-h-[420px] overflow-y-auto"
            >
              <div class="text-[10px] font-bold tracking-[.6px] text-[#8aa0b4] uppercase px-2.5 pt-2 pb-1">
                {{ notifications().length }} active
              </div>
              <div *ngIf="notifications().length === 0" class="text-center text-[12.5px] text-[#9aabbb] py-6">
                Nothing needs attention right now.
              </div>
              <a
                *ngFor="let n of notifications()"
                [routerLink]="['/', n.route]"
                (click)="notifMenuOpen = false"
                class="flex items-start gap-[10px] px-2.5 py-2.5 rounded-lg cursor-pointer hover:bg-[#f1f4f8]"
              >
                <i class="ph {{ n.icon }} text-[15px] mt-0.5 flex-none" [style.color]="n.severity === 'critical' ? '#b42318' : '#97600a'"></i>
                <span class="text-[12.5px] leading-snug" [style.color]="n.severity === 'critical' ? '#b42318' : '#5f7689'">{{ n.text }}</span>
              </a>
            </div>
          </div>

          <!-- Role switcher -->
          <div class="relative flex-none">
            <button
              (click)="roleMenuOpen = !roleMenuOpen; notifMenuOpen = false"
              class="flex items-center gap-[9px] border border-[#e2e8ee] bg-white rounded-[9px] pl-[6px] pr-[9px] py-[5px] hover:bg-[#f7f9fb]"
            >
              <span class="w-[30px] h-[30px] rounded-[7px] bg-brand-dark flex items-center justify-center text-[11px] font-semibold text-[#7fd9cd] flex-none">
                {{ roleInitials() }}
              </span>
              <span class="text-left leading-[1.2]">
                <span class="block text-[12.5px] font-semibold text-[#1c3a4d]">{{ roleLabel(role()) }}</span>
                <span class="block text-[10.5px] text-[#8094a6]">{{ roleTitle(role()) }}</span>
              </span>
              <i class="ph ph-caret-down text-[13px] text-[#8aa0b4]"></i>
            </button>
            <div
              *ngIf="roleMenuOpen"
              class="absolute top-[48px] right-0 w-[260px] bg-white border border-[#e2e8ee] rounded-xl shadow-[0_12px_30px_rgba(18,40,55,.16)] p-1.5 z-40"
            >
              <div class="text-[10px] font-bold tracking-[.6px] text-[#8aa0b4] uppercase px-2.5 pt-2 pb-1">Switch Role</div>
              <div
                *ngFor="let r of roleKeys"
                (click)="selectRole(r)"
                class="flex items-center gap-[10px] px-2.5 py-2 rounded-lg cursor-pointer hover:bg-[#f1f4f8]"
                [class]="r === role() ? 'bg-[#eaf5f3]' : ''"
              >
                <span class="w-[30px] h-[30px] rounded-[7px] bg-line-2 flex items-center justify-center text-[11px] font-semibold text-[#3f6087] flex-none">
                  {{ initialsFor(r) }}
                </span>
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] font-semibold text-[#22384a]">{{ roleLabel(r) }}</div>
                  <div class="text-[11px] text-[#8094a6]">{{ scopeFor(r) }}</div>
                </div>
                <i *ngIf="r === role()" class="ph ph-check text-brand text-[15px]"></i>
              </div>
            </div>
          </div>
        </header>

        <main class="flex-1 overflow-y-auto px-6 pt-[22px] pb-[44px]">
          <!-- Shell-level module header, shared by every page -->
          <div *ngIf="activeModule() as mod" class="flex items-start gap-4 mb-[18px]">
            <div class="w-[46px] h-[46px] rounded-xl bg-success-bg flex items-center justify-center flex-none">
              <i class="ph {{ mod.icon }} text-[24px] text-brand"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-[10px] flex-wrap">
                <h1 class="m-0 text-[21px] font-semibold text-[#12303f]">{{ mod.name }}</h1>
                <span class="font-mono font-semibold text-[10.5px] text-[#7d93a6] bg-[#e7edf2] px-[9px] py-[3px] rounded-pill tracking-[.5px]">
                  MODULE {{ mod.id }}
                </span>
              </div>
              <p class="mt-[5px] mb-0 text-[13.5px] text-[#5f7689] max-w-[780px] leading-[1.45]">{{ mod.desc }}</p>
            </div>
          </div>

          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
})
export class LayoutComponent implements OnInit, OnDestroy {
  private clockTimer: any;
  private readonly now = signal(new Date());
  private routerSub: any;
  private searchTimer: any;

  clockTime = computed(() => this.now().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  clockDate = computed(() => this.now().toLocaleDateString());

  role = computed(() => this.roleService.role());
  groups = computed(() => groupedModulesForRole(this.role()));
  activeModule = signal(moduleByRoute('front-office'));
  breadcrumb = computed(() => {
    const mod = this.activeModule();
    return mod ? `${mod.group}  \u203a  ${mod.short}` : 'Aarogya HIMS';
  });

  roleKeys = Object.keys(ROLES);
  roleLabel = roleLabel;
  roleTitle = roleTitle;
  routeFor = routeFor;
  roleMenuOpen = false;
  notifMenuOpen = false;

  searchQuery = '';
  searchOpen = false;
  searchLoading = false;
  searchResults: PatientResult[] = [];

  private labOrders: RealtimeTableHandle<any>;
  private radiologyOrders: RealtimeTableHandle<any>;
  private bloodInventory: RealtimeTableHandle<any>;
  private edVisits: RealtimeTableHandle<any>;
  private prescriptions: RealtimeTableHandle<any>;

  constructor(
    public roleService: RoleService,
    private router: Router,
    private supabaseService: SupabaseService,
    private realtime: RealtimeTableService
  ) {
    this.labOrders = this.realtime.watch('lab_orders');
    this.radiologyOrders = this.realtime.watch('radiology_orders');
    this.bloodInventory = this.realtime.watch('blood_inventory');
    this.edVisits = this.realtime.watch('ed_visits');
    this.prescriptions = this.realtime.watch('prescriptions');
  }

  // Live-computed, not stored -- recalculated from current data every time
  // the panel opens, so it can never show a stale alert for something
  // that's since been resolved. This is the structural fix the alert-
  // fatigue research points to: surface only what's actually still true,
  // not an accumulating log of everything that ever happened.
  notifications(): NotificationItem[] {
    const items: NotificationItem[] = [];
    const now = Date.now();

    for (const o of this.labOrders.data()) {
      if (o.critical && o.stage !== 'Validated') {
        items.push({ severity: 'critical', icon: 'ph-flask', route: 'laboratory', text: `Critical lab result -- ${o.patient} (${o.test})` });
      }
    }
    for (const o of this.radiologyOrders.data()) {
      if (o.critical && o.stage !== 'Verified') {
        items.push({ severity: 'critical', icon: 'ph-scan', route: 'radiology', text: `Critical imaging finding -- ${o.patient} (${o.scan})` });
      }
    }
    for (const v of this.edVisits.data()) {
      if (v.status === 'Triage' && v.created_at && now - new Date(v.created_at).getTime() > 30 * 60000) {
        items.push({ severity: 'critical', icon: 'ph-first-aid-kit', route: 'emergency', text: `${v.patient} has been waiting in ED triage over 30 minutes` });
      }
    }
    for (const b of this.bloodInventory.data()) {
      if (b.min_threshold != null && b.units <= b.min_threshold) {
        items.push({ severity: 'warning', icon: 'ph-drop', route: 'blood-bank', text: `${b.blood_group} blood stock at ${b.units} units (min ${b.min_threshold})` });
      }
    }
    for (const rx of this.prescriptions.data()) {
      if (rx.priority === 'STAT' && rx.status !== 'Dispensed' && rx.created_at && now - new Date(rx.created_at).getTime() > 15 * 60000) {
        items.push({ severity: 'warning', icon: 'ph-pill', route: 'pharmacy', text: `STAT prescription for ${rx.patient} still not dispensed after 15+ min` });
      }
    }

    // Critical items first, matching the priority-sort principle used
    // throughout the app rather than showing them in arrival order.
    return items.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1));
  }

  ngOnInit() {
    this.clockTimer = setInterval(() => this.now.set(new Date()), 30_000);
    this.updateActiveModule(this.router.url);
    this.routerSub = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.updateActiveModule(e.urlAfterRedirects ?? e.url);
      this.roleMenuOpen = false;
      this.notifMenuOpen = false;
      this.searchOpen = false;
    });
  }

  private updateActiveModule(url: string) {
    const path = url.split('?')[0].replace(/^\//, '');
    this.activeModule.set(moduleByRoute(path));
  }

  ngOnDestroy() {
    clearInterval(this.clockTimer);
    this.routerSub?.unsubscribe();
    this.labOrders.dispose();
    this.radiologyOrders.dispose();
    this.bloodInventory.dispose();
    this.edVisits.dispose();
    this.prescriptions.dispose();
    clearTimeout(this.searchTimer);
  }

  selectRole(role: string) {
    this.roleService.setRole(role);
    this.roleMenuOpen = false;
  }

  roleInitials(): string {
    return this.initialsFor(this.role() ?? '');
  }

  initialsFor(role: string): string {
    return this.initials(roleLabel(role));
  }

  initials(text: string): string {
    return text.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }

  scopeFor(role: string): string {
    const mods = ROLES[role]?.mods;
    if (mods === null || mods === undefined) return 'All 27 modules';
    return `${mods.length} module${mods.length === 1 ? '' : 's'}`;
  }

  onSearchChange(value: string) {
    this.searchOpen = true;
    clearTimeout(this.searchTimer);
    if (!value.trim()) {
      this.searchResults = [];
      return;
    }
    this.searchLoading = true;
    this.searchTimer = setTimeout(() => this.runSearch(value), 250);
  }

  private async runSearch(value: string) {
    const { data, error } = await this.supabaseService.client
      .from('patients')
      .select('id, name, mrn, status, dept')
      .or(`name.ilike.%${value}%,mrn.ilike.%${value}%`)
      .limit(6);
    this.searchLoading = false;
    if (error) {
      console.error(error);
      this.searchResults = [];
      return;
    }
    this.searchResults = data ?? [];
  }
}
