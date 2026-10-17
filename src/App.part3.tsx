function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [view, setView] = useState<View>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InvestigationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [reportAlert, setReportAlert] = useState<Alert | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [showAddData, setShowAddData] = useState(false);
  const [savingData, setSavingData] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseClient();
    if (!sb) { setAuthLoading(false); return; }
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, next) => {
      setSession(next);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const loadData = useCallback(async () => {
    if (!session || demoMode) return;
    setLoading(true);
    setError('');
    try {
      const [tx, al, conns] = await Promise.all([
        fetchTransactions(), fetchAlerts(), fetchConnections(),
      ]);
      setTransactions(tx);
      setAlerts(al);
      setConnections(conns);
      setMetrics(await fetchMetrics(tx, al));
      if (!selectedId && al[0]) setSelectedId(al[0].id);
    } catch {
      setError('SignalZero could not load your records. Retry to try again.');
    } finally {
      setLoading(false);
    }
  }, [session, demoMode, selectedId]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    if (demoMode) {
      const seed = demoSeed();
      const alert = seed.alerts.find((a) => a.id === selectedId) ?? null;
      const txn = alert
        ? seed.transactions.find((t) => t.id === alert.transactionId) ?? null
        : null;
      setDetail(alert && txn ? {
        alert, transaction: txn, relatedTransactions: [],
        timeline: alert.evidence, relatedActivity: [], baseline: null,
      } : null);
      return;
    }
    setDetailLoading(true);
    fetchAlertDetail(selectedId, transactions, alerts)
      .then(setDetail).catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId, alerts, transactions, demoMode]);
