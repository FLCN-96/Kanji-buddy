// Run orchestrator

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "variant": "hud",
  "accent": "cyan",
  "scanlines": "off",
  "density": "comfortable",
  "state": "fresh"
}/*EDITMODE-END*/;

const RUN_SIZE = 12;

const RunTopbar = ({ phase, timer, onQuit, idx, total }) => (
  <header className="run-top">
    <div className="run-top-l">
      <button className="run-quit" onClick={onQuit}>‹ quit</button>
      <span className="run-lbl">▸ RUN</span>
    </div>
    <div className="run-timer">
      {phase === 'run' ? `${String(idx+1).padStart(2,'0')} / ${String(total).padStart(2,'0')} · ${timer}` : phase === 'pre' ? 'PRE-FLIGHT' : 'COMPLETE'}
    </div>
    <div className="run-top-r">
      <span style={{display:'inline-flex',alignItems:'center',gap:4,color:'var(--accent-cyan)'}}>
        <span style={{width:6,height:6,background:'var(--accent-cyan)',boxShadow:'0 0 6px var(--accent-cyan)'}} /> LIVE
      </span>
    </div>
  </header>
);

const RunStatusbar = ({ results, combo }) => {
  const c = { miss:0, hard:0, ok:0, easy:0 };
  results.forEach(r => { if (c[r] != null) c[r]++; });
  const hits = c.ok + c.easy + c.hard;
  return (
    <footer className="run-statusbar">
      <div className="run-statusbar-l">
        <span className="run-pill hit">HIT · <b>{hits}</b></span>
        <span className="run-pill miss">MISS · <b>{c.miss}</b></span>
        <span className="run-pill skip">HARD · <b>{c.hard}</b></span>
      </div>
      <span>{combo >= 2 ? `combo ×${combo}` : 'kanji-buddy · 0.3.1'}</span>
    </footer>
  );
};

const TweaksPanel = ({ open, onClose, tweaks, onSet }) => {
  const opt = (key, options) => (
    <div className="tweaks-row">
      <div className="tweaks-lbl">▸ {key.toUpperCase()}</div>
      <div className="tweaks-opts">
        {options.map(o => (
          <button key={o.id} className={`tweaks-btn${tweaks[key] === o.id ? ' is-active' : ''}`} onClick={() => onSet(key, o.id)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
  return (
    <div className={`tweaks${open ? ' is-open' : ''}`}>
      <div className="tweaks-head"><span>TWEAKS</span><button className="tweaks-close" onClick={onClose}>╳</button></div>
      <div className="tweaks-body">
        {opt('variant', [{id:'calm',label:'calm'},{id:'hud',label:'hud'},{id:'game',label:'game'}])}
        {opt('state', [{id:'fresh',label:'fresh'},{id:'clear',label:'clear'},{id:'behind',label:'behind'}])}
        {opt('accent', [{id:'cyan',label:'cyan+mag'},{id:'dim',label:'teal+rose'}])}
        {opt('scanlines', [{id:'off',label:'off'},{id:'on',label:'on'}])}
        {opt('density', [{id:'comfortable',label:'comfort'},{id:'compact',label:'compact'}])}
      </div>
    </div>
  );
};

const RunApp = ({ cards }) => {
  const [tweaks, setTweaks] = React.useState(() => {
    try {
      const saved = localStorage.getItem('kb-tweaks');
      if (saved) return { ...TWEAK_DEFAULTS, ...JSON.parse(saved) };
    } catch(e) {}
    return TWEAK_DEFAULTS;
  });
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [phase, setPhase] = React.useState('pre'); // pre | run | end
  const [idx, setIdx] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [results, setResults] = React.useState([]);
  const [flash, setFlash] = React.useState(null);
  const [combo, setCombo] = React.useState(0);
  const [comboPulse, setComboPulse] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState(null);
  const [cardStartedAt, setCardStartedAt] = React.useState(null);
  const [now, setNow] = React.useState(Date.now());
  const [duration, setDuration] = React.useState(0);

  // Build run deck: take RUN_SIZE cards; if state=behind take later indices; if clear, fewer
  const runDeck = React.useMemo(() => {
    if (!cards) return [];
    const n = tweaks.state === 'clear' ? 6 : tweaks.state === 'behind' ? 15 : RUN_SIZE;
    const start = tweaks.state === 'behind' ? 40 : tweaks.state === 'clear' ? 60 : 0;
    return cards.slice(start, start + n);
  }, [cards, tweaks.state]);

  React.useEffect(() => {
    document.body.dataset.accent = tweaks.accent;
    document.body.dataset.scanlines = tweaks.scanlines;
    document.body.dataset.density = tweaks.density;
    try { localStorage.setItem('kb-tweaks', JSON.stringify(tweaks)); } catch(e) {}
  }, [tweaks]);

  React.useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode') { setEditMode(true); setTweaksOpen(true); }
      else if (e.data?.type === '__deactivate_edit_mode') { setEditMode(false); setTweaksOpen(false); }
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({type: '__edit_mode_available'}, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  // live timer
  React.useEffect(() => {
    if (phase !== 'run') return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [phase]);

  const setTweak = (k, v) => {
    const next = { ...tweaks, [k]: v };
    setTweaks(next);
    try { window.parent.postMessage({type:'__edit_mode_set_keys', edits:{[k]: v}}, '*'); } catch(e) {}
  };

  const startRun = () => {
    setPhase('run'); setIdx(0); setResults([]); setRevealed(false);
    setCombo(0); setFlash(null);
    const t = Date.now();
    setStartedAt(t); setCardStartedAt(t); setNow(t);
  };

  const reveal = () => setRevealed(true);

  const verdict = (v) => {
    if (!revealed) return;
    const nextResults = [...results, v];
    setResults(nextResults);

    if (v === 'ok' || v === 'easy') {
      setFlash('hit');
      const c = combo + 1;
      setCombo(c);
      setComboPulse(true);
      setTimeout(() => setComboPulse(false), 340);
    } else if (v === 'miss') {
      setFlash('miss'); setCombo(0);
    } else {
      setFlash(null); setCombo(0);
    }
    setTimeout(() => setFlash(null), 340);

    // advance
    setTimeout(() => {
      if (idx + 1 >= runDeck.length) {
        setDuration(Math.round((Date.now() - startedAt) / 1000));
        setPhase('end');
      } else {
        setIdx(idx + 1);
        setRevealed(false);
        setCardStartedAt(Date.now());
      }
    }, v === 'miss' ? 360 : 260);
  };

  // keyboard
  React.useEffect(() => {
    const onKey = (e) => {
      if (phase === 'pre') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); startRun(); }
      } else if (phase === 'run') {
        if (e.key === ' ') { e.preventDefault(); if (!revealed) reveal(); }
        else if (e.key === '1') { if (revealed) verdict('miss'); }
        else if (e.key === '2') { if (revealed) verdict('hard'); }
        else if (e.key === '3') { if (revealed) verdict('ok'); }
        else if (e.key === '4') { if (revealed) verdict('easy'); }
        else if (e.key === 'Escape') { setPhase('pre'); setResults([]); }
      } else if (phase === 'end') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); startRun(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, revealed, idx, runDeck, results, combo, startedAt]);

  const quit = () => {
    if (phase === 'run' && !confirm('Quit run? Progress will be lost.')) return;
    window.location.href = 'Home.html';
  };

  const timer = React.useMemo(() => {
    if (!startedAt) return '00:00';
    const s = Math.floor((now - startedAt)/1000);
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }, [now, startedAt]);

  const cardLatency = cardStartedAt ? Math.floor((now - cardStartedAt)/1000) : 0;
  const shellCls = `run-shell variant-${tweaks.variant}`;

  return (
    <>
      <div className={shellCls}>
        <RunTopbar phase={phase} timer={timer} idx={idx} total={runDeck.length} onQuit={quit} />
        {phase === 'run' && (
          <SegProgress results={results} current={idx} total={runDeck.length} />
        )}
        <main className="run-main" data-screen-label={`run-${phase}`}>
          {phase === 'pre' && <PreRun state={tweaks.state} total={runDeck.length} onStart={startRun} />}
          {phase === 'run' && runDeck[idx] && (
            <>
              <Card
                card={runDeck[idx]}
                revealed={revealed}
                onReveal={reveal}
                latency={cardLatency}
                flash={flash}
              />
              <VerdictBar enabled={revealed} onVerdict={verdict} />
            </>
          )}
          {phase === 'end' && (
            <EndRun
              results={results}
              cards={runDeck}
              duration={duration}
              onAgain={startRun}
              onHome={() => window.location.href = 'Home.html'}
              variant={tweaks.variant}
            />
          )}
        </main>
        <RunStatusbar results={results} combo={combo} />
      </div>
      {phase === 'run' && <ComboChip combo={combo} pulse={comboPulse} />}
      {!editMode && (
        <button className="tweaks-float" onClick={() => setTweaksOpen(o => !o)}>▸ tweaks</button>
      )}
      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} tweaks={tweaks} onSet={setTweak} />
    </>
  );
};

Object.assign(window, { RunApp });
