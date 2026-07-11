import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface RealtimeTableHandle<T> {
  data: () => T[];
  loading: () => boolean;
  error: () => string | null;
  refresh: () => Promise<void>;
  dispose: () => void;
}

/**
 * Fetches a Supabase table and keeps it live via a Realtime channel, so
 * multiple simultaneous users (e.g. the OPD queue board) see each other's
 * changes without polling. Call `.dispose()` in ngOnDestroy to unsubscribe.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeTableService {
  constructor(private supabaseService: SupabaseService) {}

  watch<T = any>(
    table: string,
    queryFn?: (q: any) => any
  ): RealtimeTableHandle<T> {
    const data = signal<T[]>([]);
    const loading = signal(true);
    const error = signal<string | null>(null);
    const client = this.supabaseService.client;

    const refresh = async () => {
      let q: any = client.from(table).select('*');
      if (queryFn) q = queryFn(q);
      const { data: rows, error: err } = await q;
      if (err) {
        error.set(err.message);
      } else {
        data.set(rows ?? []);
        error.set(null);
      }
      loading.set(false);
    };

    refresh();

    const channel = client
      .channel(`realtime:${table}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => refresh())
      .subscribe();

    return {
      data: data.asReadonly(),
      loading: loading.asReadonly(),
      error: error.asReadonly(),
      refresh,
      dispose: () => {
        client.removeChannel(channel);
      },
    };
  }
}
