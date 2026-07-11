import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ready;

  if (auth.session()) return true;
  return router.createUrlTree(['/login'], { queryParams: { redirectTo: state.url } });
};
