import { Injectable, signal } from '@angular/core';
import { ROLES } from './modules';

const STORAGE_KEY = 'hims-demo-role';
const DEFAULT_ROLE = 'admin';

/**
 * DEMO-MODE role selection. There is no login — the person using the app
 * just picks a role from the tab bar, and the sidebar + (per the matching
 * Supabase policy changes) data access follow that choice.
 *
 * This is intentionally NOT real authentication: nothing server-side
 * verifies the chosen role, because there's no signed-in identity to check
 * it against. See supabase/demo-open-access.sql — Supabase's Row Level
 * Security is opened up to match, since there's no session for RLS to
 * inspect. Anyone who can load the app can act as any role and read/write
 * everything. Fine for demos and internal testing; not appropriate for a
 * deployment holding real patient data. See README.md before going further
 * than that.
 */
@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly _role = signal<string>(this.loadInitial());
  readonly role = this._role.asReadonly();

  private loadInitial(): string {
    if (typeof localStorage === 'undefined') return DEFAULT_ROLE;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved && ROLES[saved] ? saved : DEFAULT_ROLE;
    } catch {
      return DEFAULT_ROLE;
    }
  }

  setRole(role: string) {
    if (!ROLES[role]) return;
    this._role.set(role);
    try {
      localStorage.setItem(STORAGE_KEY, role);
    } catch {
      // localStorage unavailable (e.g. private browsing) — role still works for this session
    }
  }
}
