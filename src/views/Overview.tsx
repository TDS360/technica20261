
import { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  Clock3,
  Info,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

import type {
  Alert,
  Connection,
  DashboardMetrics,
  Transaction,
} from '@/lib/signalzero';

import {
  EmptyState,
  MetricCard,
  PageIntro,
  SeverityBadge,
  StatusBadge,
  formatDate,
  formatMoney,
} from './helpers';

type OverviewProps = {
  metrics: DashboardMetrics | null;
  alerts: Alert[];
  transactions: Transaction[];
  loading: boolean;
  onOpen: (id: string) => void;
  onRefresh: () => void;
  demoMode: boolean;
  connections: Connection[];
};

const chartColors = [
  '#39d6c0',
  '#ff9d9d',
  '#e5a75d',
  '#7895ff',
];

function formatTransactionAmount(
  transaction: Transaction | undefined,
): string {
  if (!transaction) return '—';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: transaction.currency || 'USD',
      maximumFractionDigits: 2,
    }).format(transaction.amount);
  } catch {
    return formatMoney(transaction.amount);
  }
}

export function OverviewView({
  metrics,
  alerts,
  transactions,
  loading,
  onOpen,
  onRefresh,
  demoMode,
  connections,
}: OverviewProps) {
  const transactionById = useMemo(
    () =>
      new Map(
        transactions.map((transaction) => [
          transaction.id,
          transaction,
        ]),
      ),
    [transactions],
  );

  const recentAlerts = useMemo(
    () =>
      [...alerts]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime(),
        )
        .slice(0, 5),
    [alerts],
  );

  const lastSync = useMemo(() => {
    const timestamps = connections
      .map((connection) => connection.lastSyncedAt)
      .filter((date): date is string => Boolean(date))
      .sort(
        (a, b) =>
          new Date(b).getTime() - new Date(a).getTime(),
      );

    return timestamps[0] ?? null;
  }, [connections]);

  const activity = metrics?.activity ?? [];

  const maxTransactions = Math.max(
    1,
    ...activity.map((item) => item.transactions),
  );

  const maxAlerts = Math.max(
    1,
    ...activity.map((item) => item.alerts),
  );

  const detectionBreakdown = useMemo(() => {
    const counts = new Map<string, number>();

    alerts.forEach((alert) => {
      counts.set(
        alert.type,
        (counts.get(alert.type) ?? 0) + 1,
      );
    });

    return [...counts.entries()]
      .map(([type, count]) => ({
        type,
        count,
        percentage:
          alerts.length > 0
            ? (count / alerts.length) * 100
            : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [alerts]);

  const circumference = 2 * Math.PI * 36;
  let circleOffset = 0;

  return (
    <>
      <PageIntro
        eyebrow="FINANCIAL CRIME INTELLIGENCE"
        title="Fraud Operations Overview"
        body="Monitor flagged financial activity, review detection signals, and manage investigations."
        action={
          <button
            className="button button-secondary"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {loading ? 'Refreshing...' : 'Refresh data'}
          </button>
        }
      />

      {/* Sandbox disclosure */}
      <div className="notice" role="note">
        <div className="notice-icon">
          <Info size={18} aria-hidden="true" />
        </div>

        <div>
          <strong>
            {demoMode
              ? 'Local demo environment'
              : 'Sandbox environment'}
          </strong>

          <span>
            {demoMode
              ? 'Read-only demonstration records are displayed.'
              : 'Nessie provides simulated banking data, not live bank transactions.'}

            {lastSync
              ? ` Last successful sync: ${formatDate(lastSync)}.`
              : ' No successful account sync recorded yet.'}

            {' '}An alert is a signal for investigation, not proof of fraud.
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <section aria-label="Financial activity metrics">
        <div className="metrics-grid">
          {loading && !metrics ? (
            <>
              <div className="skeleton metric-skeleton" />
              <div className="skeleton metric-skeleton" />
              <div className="skeleton metric-skeleton" />
              <div className="skeleton metric-skeleton" />
            </>
          ) : (
            <>
              <MetricCard
                label="Transactions analyzed"
                value={metrics?.totalTransactions ?? 0}
                detail="Stored transactions"
                icon={BarChart3}
                tone="cyan"
              />

              <MetricCard
                label="Suspicious alerts"
                value={metrics?.suspiciousAlerts ?? 0}
                detail="Detection engine findings"
                icon={AlertTriangle}
                tone="red"
              />

              <MetricCard
                label="Open investigations"
                value={metrics?.openInvestigations ?? 0}
                detail="Awaiting review or resolution"
                icon={Clock3}
                tone="amber"
              />

              <MetricCard
                label="Resolved investigations"
                value={metrics?.resolvedInvestigations ?? 0}
                detail="Cases marked resolved"
                icon={Check}
                tone="green"
              />
            </>
          )}
        </div>
      </section>

      {/* Chart and detection breakdown */}
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-header">
            <div>
              <h2>Transaction Activity</h2>
              <p>Transaction volume and alerts over the last 7 days</p>
            </div>

            <Activity
              size={20}
              aria-hidden="true"
            />
          </div>

          <div className="p-4">
            <div className="flex flex-wrap gap-4 mb-4 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ backgroundColor: chartColors[0] }}
                />
                Transactions
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ backgroundColor: chartColors[1] }}
                />
                Alerts
              </div>
            </div>

            {activity.length === 0 ? (
              <EmptyState
                title="No activity to chart"
                body="Sync a sandbox account to analyze transactions."
              />
            ) : (
              <div
                className="chart"
                role="img"
                aria-label="Daily transaction volumes and alert counts for the last seven days."
              >
                {activity.map((item) => (
                  <div
                    className="chart-column"
                    key={item.label}
                  >
                    <div className="chart-bars">
                      <div
                        className="chart-alert"
                        title={`${item.alerts} alerts`}
                        style={{
                          height: `${
                            (item.alerts / maxAlerts) * 100
                          }%`,
                          minHeight: item.alerts > 0 ? '4px' : '0',
                          backgroundColor: chartColors[1],
                        }}
                      />

                      <div
                        className="chart-bar"
                        title={`${item.transactions} transactions`}
                        style={{
                          height: `${
                            (item.transactions / maxTransactions) * 100
                          }%`,
                          minHeight:
                            item.transactions > 0 ? '4px' : '0',
                          backgroundColor: chartColors[0],
                        }}
                      />
                    </div>

                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            )}

            {activity.length > 0 && (
              <div className="overflow-x-auto mt-4">
                <table aria-label="Transaction activity details">
                  <thead>
                    <tr>
                      <th scope="col">Day</th>
                      <th scope="col">Transactions</th>
                      <th scope="col">Alerts</th>
                    </tr>
                  </thead>

                  <tbody>
                    {activity.map((item) => (
                      <tr key={item.label}>
                        <td>{item.label}</td>
                        <td>{item.transactions}</td>
                        <td>{item.alerts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Detection Breakdown</h2>
              <p>Recorded alert types</p>
            </div>

            <ShieldAlert size={20} aria-hidden="true" />
          </div>

          <div className="p-4">
            <div className="flex justify-center my-4">
              <div className="relative w-40 h-40">
                <svg
                  viewBox="0 0 100 100"
                  className="w-full h-full"
                  role="img"
                  aria-label={`${alerts.length} recorded alerts, grouped by detection type`}
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="36"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="12"
                  />

                  {detectionBreakdown.map((item, index) => {
                    const segmentLength =
                      (item.count / Math.max(alerts.length, 1)) *
                      circumference;

                    const currentOffset = circleOffset;
                    circleOffset += segmentLength;

                    return (
                      <circle
                        key={item.type}
                        cx="50"
                        cy="50"
                        r="36"
                        fill="none"
                        stroke={
                          chartColors[index % chartColors.length]
                        }
                        strokeWidth="12"
                        strokeDasharray={`${segmentLength} ${
                          circumference - segmentLength
                        }`}
                        strokeDashoffset={-currentOffset}
                        transform="rotate(-90 50 50)"
                      />
                    );
                  })}
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold">
                    {alerts.length.toLocaleString()}
                  </span>
                  <span className="text-xs muted">
                    Alerts
                  </span>
                </div>
              </div>
            </div>

            {detectionBreakdown.length === 0 ? (
              <EmptyState
                title="No detection signals"
                body="Your detection breakdown will appear when alerts are created."
              />
            ) : (
              <div className="space-y-3">
                {detectionBreakdown.map((item, index) => (
                  <div
                    className="flex items-center justify-between gap-3"
                    key={item.type}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              chartColors[index % chartColors.length],
                          }}
                        />
                        <span className="text-sm">
                          {item.type}
                        </span>
                      </div>

                      <div className="text-xs muted mt-1">
                        {item.count} recorded alert
                        {item.count === 1 ? '' : 's'}
                      </div>
                    </div>

                    <strong className="text-sm">
                      {Math.round(item.percentage)}%
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Recent alert queue */}
      <section className="panel mt-6">
        <div className="panel-header">
          <div>
            <h2>Recent Alert Queue</h2>
            <p>
              Review detection findings and open their investigations.
            </p>
          </div>

          <span className="badge badge-open">
            {alerts.filter((a) => a.status !== 'resolved').length} open
          </span>
        </div>

        {recentAlerts.length === 0 ? (
          <EmptyState
            title="No alerts yet"
            body="Connect a sandbox account and sync transactions, or add a test transaction from the Alerts page."
          />
        ) : (
          <div className="table-wrap overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th scope="col">Alert ID</th>
                  <th scope="col">Timestamp</th>
                  <th scope="col">Merchant</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Detection reason</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>

              <tbody>
                {recentAlerts.map((alert) => {
                  const transaction = transactionById.get(
                    alert.transactionId,
                  );

                  return (
                    <tr key={alert.id}>
                      <td>
                        <strong>{alert.id}</strong>
                      </td>

                      <td>{formatDate(alert.createdAt)}</td>

                      <td>
                        {transaction?.merchant ?? 'Unknown merchant'}
                      </td>

                      <td className="whitespace-nowrap">
                        {formatTransactionAmount(transaction)}
                      </td>

                      <td>
                        <div className="flex items-start gap-2">
                          <AlertTriangle
                            size={15}
                            aria-hidden="true"
                          />
                          <span>{alert.reason}</span>
                        </div>
                      </td>

                      <td>
                        <SeverityBadge severity={alert.severity} />
                      </td>

                      <td>
                        <StatusBadge status={alert.status} />
                      </td>

                      <td>
                        <button
                          className="button button-secondary"
                          onClick={() => onOpen(alert.id)}
                          aria-label={`Investigate alert ${alert.id}`}
                        >
                          Investigate
                          <ChevronRight
                            size={15}
                            aria-hidden="true"
                          />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="panel-header">
          <span className="text-sm muted">
            Showing {recentAlerts.length} of {alerts.length} alerts
          </span>

          {alerts.length > 0 && (
            <button
              className="text-button"
              onClick={() => onOpen(recentAlerts[0].id)}
            >
              Open latest investigation
              <ArrowUpRight size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </section>
    </>
  );
}
