import { Injectable, signal, computed } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export interface Profile {
  id: string;
  full_name: string;
  role: string;
  client_id?: string | null;
  department?: string | null;
  title?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _session = signal<Session | null>(null);
  private readonly _profile = signal<Profile | null>(null);
  private readonly _loading = signal(true);
  private readyResolve!: () => void;
  readonly ready: Promise<void> = new Promise((resolve) => {
    this.readyResolve = resolve;
  });

  readonly session = this._session.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly role = computed(() => this._profile()?.role ?? null);
  readonly user = computed(() => this._session()?.user ?? null);

  constructor(private supabaseService: SupabaseService) {
    this.init();
  }

  private async init() {
    const { data } = await this.supabaseService.client.auth.getSession();
    this._session.set(data.session);
    if (data.session?.user?.id) {
      await this.loadProfile(data.session.user.id);
    }
    this._loading.set(false);
    this.readyResolve();

    this.supabaseService.client.auth.onAuthStateChange(async (_event, session) => {
      this._session.set(session);
      if (session?.user?.id) {
        await this.loadProfile(session.user.id);
      } else {
        this._profile.set(null);
      }
    });
  }

  private async loadProfile(userId: string) {
    const { data, error } = await this.supabaseService.client
      .from('profiles')
      .select('id, full_name, role, client_id, department, title')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('Failed to load profile', error);
      this._profile.set(null);
    } else {
      this._profile.set(data as Profile);
    }
  }

  signIn(email: string, password: string) {
    return this.supabaseService.client.auth.signInWithPassword({ email, password });
  }

  signOut() {
    return this.supabaseService.client.auth.signOut();
  }
}
