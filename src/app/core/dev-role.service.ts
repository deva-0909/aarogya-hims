import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Dev-only nav simulation. Overrides which role's sidebar is shown, WITHOUT
 * touching the real `profiles.role` in Supabase and WITHOUT affecting RLS —
 * live modules still read/write using the signed-in user's real role and
 * permissions underneath. This only exists to let an admin eyeball each
 * role's nav during QA; it's not a permission escalation mechanism (nothing
 * server-side even knows this override exists).
 *
 * Only ever surfaced in non-production builds — see `isAvailable`.
 */
@Injectable({ providedIn: 'root' })
export class DevRoleService {
  private readonly _overrideRole = signal<string | null>(null);
  readonly overrideRole = this._overrideRole.asReadonly();

  /** Only relevant in dev builds. The component using this also gates on the real role being admin/superadmin. */
  readonly isAvailable = !environment.production;

  setOverride(role: string | null) {
    this._overrideRole.set(role);
  }

  clear() {
    this._overrideRole.set(null);
  }
}
