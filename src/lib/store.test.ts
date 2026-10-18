import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mockState = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('./signalzero', () => ({
  alertTypeToDetection: (type: string) => type,
  supabaseClient: () => mockState.client,
}));

import { syncConnection } from './store';
import type { Connection } from './signalzero';

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

class MemoryQuery {
  private operation: 'select' | 'upsert' | 'update' = 'select';
  private payload: Row | Row[] = {};
  private filters: Filter[] = [];
  private conflict = '';
  private ignoreDuplicates = false;

  constructor(private readonly owner: MemorySupabase, private readonly table: string) {}

  select() { return this; }
  order() { return this; }
  limit() { return this; }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  upsert(payload: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.operation = 'upsert';
    this.payload = payload;
    this.conflict = options?.onConflict ?? '';
    this.ignoreDuplicates = options?.ignoreDuplicates ?? false;
    return this;
  }
  update(payload: Row) {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }
  maybeSingle() { return this.execute(true); }
  single() { return this.execute(true); }
  then<TResult1 = { data: Row[] | Row | null; error: null }, TResult2 = never>(
    resolve?: ((value: { data: Row[] | Row | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(resolve, reject);
  }

  private async execute(single = false): Promise<{ data: Row[] | Row | null; error: null }> {
    const rows = this.owner.rows[this.table] ?? [];
    if (this.operation === 'select') {
      const found = rows.filter((row) => this.filters.every((filter) => filter(row)));
      return { data: single ? found[0] ?? null : found, error: null };
    }
    if (this.operation === 'update') {
      for (const row of rows.filter((item) =>
        this.filters.every((filter) => filter(item)))) {
        Object.assign(row, this.payload as Row);
      }
      return { data: null, error: null };
    }
    const items = Array.isArray(this.payload) ? this.payload : [this.payload];
    const keys = this.conflict.split(',').filter(Boolean);
    for (const item of items) {
      const existing = keys.length
        ? rows.find((row) => keys.every((key) => row[key] === item[key]))
        : undefined;
      if (existing) {
        if (!this.ignoreDuplicates) Object.assign(existing, item);
      } else {
        rows.push({ ...item });
      }
    }
    this.owner.rows[this.table] = rows;
    return { data: null, error: null };
  }
}

class MemorySupabase {
  rows: Record<string, Row[]> = {
    signalzero_connections: [{
      id: 'connection-1',
      user_id: 'user-1',
      provider: 'nessie_sandbox',
      provider_account_id: 'account-1',
      status: 'connected',
    }],
    signalzero_transactions: [],
    signalzero_alerts: [],
    signalzero_evidence: [],
    signalzero_alert_feedback: [],
    signalzero_investigation_events: [],
  };
  from(table: string) { return new MemoryQuery(this, table); }
  auth = {
    getSession: async () => ({
      data: { session: { access_token: 'test-access-token' } },
      error: null,
    }),
    getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
  };
  functions = {
    invoke: async () => ({
      data: {
        provider: 'nessie_sandbox',
        accountId: 'account-1',
        purchases: Array.from({ length: 6 }, (_, index) => ({
          id: `purchase-${index + 1}`,
          amount: index === 5 ? 4500 : 20 + index,
          date: `2026-02-0${index + 1}T09:00:00.000Z`,
          description: `Purchase ${index + 1}`,
          merchantId: `merchant-${index + 1}`,
          accountId: 'account-1',
          status: 'completed',
        })),
      },
      error: null,
    }),
  };
}

describe('Nessie sync persistence', () => {
  let client: MemorySupabase;
  const connection: Connection = {
    id: 'connection-1',
    providerAccountId: 'account-1',
    nickname: 'Test account',
    accountType: 'checking',
    balance: 100,
    status: 'connected',
    lastSyncedAt: null,
    lastError: null,
  };

  beforeEach(() => {
    client = new MemorySupabase();
    mockState.client = client as unknown as SupabaseClient;
  });

  it('re-syncs the same provider dataset without duplicating rows or resetting review data', async () => {
    const first = await syncConnection(connection);
    expect(first.imported).toBe(6);
    expect(first.alertsCreated).toBe(1);
    expect(client.rows.signalzero_transactions).toHaveLength(6);
    expect(client.rows.signalzero_alerts).toHaveLength(1);
    const transactionIds = client.rows.signalzero_transactions
      .map((row) => row.id).sort();

    const alert = client.rows.signalzero_alerts[0];
    alert.status = 'resolved';
    client.rows.signalzero_alert_feedback.push({
      id: 'feedback-1',
      user_id: 'user-1',
      alert_id: alert.id,
      response: 'recognize',
      note: 'Reviewed',
    });
    client.rows.signalzero_investigation_events.push({
      id: 'event-1',
      user_id: 'user-1',
      alert_id: alert.id,
      new_status: 'resolved',
    });
    const evidenceCount = client.rows.signalzero_evidence.length;

    const second = await syncConnection(connection);

    expect(second.imported).toBe(0);
    expect(second.updated).toBe(6);
    expect(second.alertsCreated).toBe(0);
    expect(client.rows.signalzero_transactions).toHaveLength(6);
    expect(client.rows.signalzero_transactions.map((row) => row.id).sort())
      .toEqual(transactionIds);
    expect(client.rows.signalzero_alerts).toHaveLength(1);
    expect(client.rows.signalzero_evidence).toHaveLength(evidenceCount);
    expect(client.rows.signalzero_alerts[0].status).toBe('resolved');
    expect(client.rows.signalzero_alert_feedback).toHaveLength(1);
    expect(client.rows.signalzero_investigation_events).toHaveLength(1);
  });
});
