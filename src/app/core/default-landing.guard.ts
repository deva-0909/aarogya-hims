import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RoleService } from './role.service';
import { defaultRouteForRole } from './modules';

// Role-specific landing: a nurse lands on Nursing, a receptionist on Front
// Office, an accountant on Billing -- not a one-size-fits-all Command
// Center that's mostly irrelevant to their actual job. Only superadmin/
// admin still land on Command Center, since it's genuinely their job to
// see the whole-hospital view.
export const defaultLandingGuard: CanActivateFn = () => {
  const roleService = inject(RoleService);
  const router = inject(Router);
  return router.parseUrl('/' + defaultRouteForRole(roleService.role()));
};
