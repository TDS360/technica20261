function FeedbackBox({ current, note, setNote, demoMode, onPick }: { current: FeedbackResponse | null; note: string; setNote: (v: string) => void; demoMode: boolean; onPick: (r: FeedbackResponse) => void }) {
  const options: { id: FeedbackResponse; label: string; hint: string }[] = [
    { id: 'recognize', label: 'I recognize this transaction', hint: 'Record it and optionally resolve.' },
    { id: 'unrecognized', label: "I don't recognize this transaction", hint: 'Check your bank app and contact the issuer officially.' },
    { id: 'unsure', label: "I'm not sure yet", hint: 'Keep it open, add a note, review related activity.' },
  ];
  return <div>
    {options.map((o) => <button key={o.id} className={`case-row ${current === o.id ? 'selected' : ''}`} onClick={() => onPick(o.id)} disabled={demoMode}><div><strong>{o.label}</strong><span>{o.hint}</span></div>{current === o.id && <Check size={16} />}</button>)}
    {!demoMode && <><label htmlFor="fb-note">Note (optional)</label><input id="fb-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for later review" /></>}
    {current === 'unrecognized' && <p className="table-sub">Nessie is a simulator — SignalZero cannot lock a real card or file a dispute. Use your issuer's official app or support channel.</p>}
  </div>;
}
