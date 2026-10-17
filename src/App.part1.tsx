import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, BarChart3, Check, ChevronRight, CircleDot, Clock3, FileText, LayoutDashboard, Menu, RefreshCw, Search, ShieldCheck, SlidersHorizontal, X, Link2, Unplug, Landmark } from 'lucide-react';
import { isSupabaseConfigured, supabaseClient } from '@/lib/signalzero';
import type { Alert, Connection, DashboardMetrics, InvestigationDetail, InvestigationStatus, SandboxAccount, Transaction } from '@/lib/signalzero';
import { connectAccount, createManualTransaction, demoSeed, disconnectAccount, fetchAlertDetail, fetchAlerts, fetchConnections, fetchMetrics, fetchTransactions, listSandboxAccounts, saveFeedback, syncConnection, updateStatus } from '@/lib/store';
import type { FeedbackResponse } from '@/lib/signalzero';
import type { Session } from '@supabase/supabase-js';

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
  { id: 'investigations', label: 'Investigations', icon: ShieldCheck },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'accounts', label: 'Accounts', icon: Landmark },
] as const;
type View = typeof navItems[number]['id'];

const formatMoney = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
const formatDate = (date: string) => {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date));
  } catch { return date; }
};

function StatusBadge({ status }: { status: InvestigationStatus }) {
  return <span className={`badge badge-${status}`}><span className="badge-dot" />{status}</span>;
}
function SeverityBadge({ severity }: { severity: Alert['severity'] }) {
  const icon = severity === 'critical' ? '‼' : severity === 'high' ? '!' : severity === 'medium' ? '▲' : '•';
  return <span className={`badge badge-${severity}`}><span className="severity-symbol">{icon}</span>{severity} severity</span>;
}
function SourcePill({ source }: { source: string }) {
  return <span className="source-pill"><span className="live-dot" />{source}</span>;
}
function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: number; detail: string; icon: typeof Activity; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><div className="metric-label">{label}</div><div className="metric-value">{value.toLocaleString()}</div><div className="metric-detail">{detail}</div></div>;
}
function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><CircleDot size={22} /><strong>{title}</strong><span>{body}</span></div>;
}
function PageIntro({ eyebrow, title, body, action }: { eyebrow: string; title: string; body: string; action?: ReactNode }) {
  return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{body}</p></div>{action}</div>;
}
