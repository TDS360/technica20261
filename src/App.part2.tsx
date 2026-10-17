function AuthScreen({ onSent }: { onSent: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  if (!isSupabaseConfigured()) {
    return <div className="auth-shell"><div className="auth-card">
      <div className="brand-mark"><Activity size={18} /></div>
      <h1>SignalZero setup required</h1>
      <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your environment, then reload. See README for the Supabase Auth setup.</p>
    </div></div>;
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setState('error');
      setMessage('Enter a valid email address to receive a sign-in link.');
      return;
    }
    setState('sending');
    setMessage('');
    try {
      const sb = supabaseClient();
      if (!sb) throw new Error('Supabase is not configured.');
      // Generic message avoids revealing whether an email has an account.
      const { error } = await sb.auth.signInWithOtp({
        email: value,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setState('sent');
      onSent(value);
    } catch {
      setState('error');
      setMessage('The sign-in link could not be sent. Check configuration and try again.');
    }
  };
  return <div className="auth-shell"><div className="auth-card" role="main" aria-label="Sign in">
    <div className="brand-mark"><Activity size={18} /></div>
    <div className="eyebrow">SignalZero · Financial intelligence</div>
    <h1>Sign in with email</h1>
    <p className="muted">We send a one-time magic link. No passwords, no card details — Nessie sandbox only.</p>
    {state === 'sent'
      ? <div className="notice" role="status"><div className="notice-icon"><Check size={18} /></div><div><strong>Check your inbox</strong><span>If the address is valid, a sign-in link is on its way. It expires soon — request a new one if needed.</span></div></div>
      : <form onSubmit={submit} className="auth-form">
        <label htmlFor="auth-email">Email address</label>
        <input id="auth-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={state === 'sending'} />
        {state === 'error' && <div className="error-banner" role="alert"><AlertTriangle size={16} /><span>{message}</span></div>}
        <button className="button button-primary" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Sending link…' : 'Send sign-in link'}</button>
      </form>}
    <p className="auth-foot">Sandbox banking data only. SignalZero never asks for card numbers, CVVs, PINs, or bank passwords.</p>
  </div></div>;
}
