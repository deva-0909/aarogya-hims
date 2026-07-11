import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor() {
    if (!environment.supabaseUrl || environment.supabaseUrl.includes('YOUR-PROJECT-REF')) {
      // eslint-disable-next-line no-console
      console.error(
        'Supabase is not configured. Edit src/environments/environment.ts with your project URL + anon key.'
      );
    }
    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
}
