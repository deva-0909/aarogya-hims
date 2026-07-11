import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-line-2">
      <div class="w-full max-w-sm bg-white border border-line-1 rounded-card p-8 shadow-sm">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-9 h-9 rounded-[9px] flex items-center justify-center flex-none bg-gradient-to-br from-brand to-[#36c3b4]">
            <i class="ph ph-pulse text-white text-xl"></i>
          </div>
          <div>
            <div class="font-bold text-[15px] text-ink-1">Aarogya HIMS</div>
            <div class="text-[10px] tracking-wide text-muted-1">CITY GENERAL HOSPITAL</div>
          </div>
        </div>

        <h1 class="text-lg font-semibold text-ink-2 mb-1">Sign in</h1>
        <p class="text-sm text-body-2 mb-5">Use the credentials your admin created for you.</p>

        <form (ngSubmit)="handleSubmit()" class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Email</label>
            <input
              type="email"
              required
              [(ngModel)]="email"
              name="email"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand"
              placeholder="you@hospital.org"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Password</label>
            <input
              type="password"
              required
              [(ngModel)]="password"
              name="password"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand"
              placeholder="••••••••"
            />
          </div>
          <div *ngIf="error" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ error }}</div>
          <button
            type="submit"
            [disabled]="busy"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {{ busy ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class LoginComponent {
  email = '';
  password = '';
  error = '';
  busy = false;

  constructor(private auth: AuthService, private router: Router, private route: ActivatedRoute) {}

  async handleSubmit() {
    this.error = '';
    this.busy = true;
    const { error } = await this.auth.signIn(this.email, this.password);
    this.busy = false;
    if (error) {
      this.error = error.message;
      return;
    }
    const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo') || '/front-office';
    this.router.navigateByUrl(redirectTo);
  }
}
