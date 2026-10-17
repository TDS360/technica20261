import type { ReactNode } from 'react';
import { CircleDot, type LucideIcon } from 'lucide-react';
import type { Alert, InvestigationStatus } from '@/lib/signalzero';

export const formatMoney = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
export const formatDate = (date: string) => {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date));
  } catch { return date; }
};
export function StatusBadge({ status }: { status: InvestigationStatus }) {
  return <span className={`badge badge-${status}`}><span className="badge-dot" />{status}</span>;
}
export function SeverityBadge({ severity }: { severity: Alert['severity'] }) {
  const icon = severity === 'critical' ? '!!' : severity === 'high' ? '!' : severity === 'medium' ? 'A' : 'o';
  return <span className={`badge badge-${severity}`}><span className="severity-symbol">{icon}</span>{severity} severity</span>;
}
export function SourcePill({ source }: { source: string }) {
  return <span className="source-pill"><span className="live-dot" />{source}</span>;
}
export function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><CircleDot size={22} /><strong>{title}</strong><span>{body}</span></div>;
}
export function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: number; detail: string; icon: LucideIcon; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><div className="metric-label">{label}</div><div className="metric-value">{value.toLocaleString()}</div><div className="metric-detail">{detail}</div></div>;
}
export function PageIntro({ eyebrow, title, body, action }: { eyebrow: string; title: string; body: string; action?: ReactNode }) {
  return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{body}</p></div>{action}</div>;
}
