// Top-level app — shell, topbar, variant tabs, tweaks panel

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "variant": "hud",
  "accent": "cyan",
  "scanlines": "off",
  "density": "comfortable",
  "hero": "on",
  "state": "fresh"
}/*EDITMODE-END*/;

const VARIANTS = [
  { id: 'calm', label: 'CALM' },
  { id: 'hud', label: 'HUD' },
  { id: 'game', label: 'GAME' },
];

const Topbar = ({ state }) => {
  const [time, setTime] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 10000);
    return () => clearInterval(t);
  }, []);
  const hhmm = time.toTimeString().slice(0,5).replace(':','');
  return (
    <header className="kb-top">
      <div className="kb-wm">kanji-buddy</div>
      <div className="kb-top-right">
        <span className="kb-hb">LIVE</span>
        <span>OPFS</span>
        <span>{hhmm}</span>
      </div>
    </header>
  );
};

const StatusBar = ({ state }) => {
  const due = state === 'clear' ? 0 : state === 'behind' ? 180 : 42;
  return (
    <footer className="kb-statusbar">
      <div className="kb-statusbar-l">
        <span>STACK · <b>3</b></span>
        <span>CARDS · <b>4,821</b></span>
        <span className={state==='behind'?'kb-amb':(state==='clear'?'kb-dim':'kb-cyan')}>
          DUE · <b>{due}</b>
        </span>
      </div>
      <span>v0.3.1</span>
    </footer>
  );
};

const VariantTabs = ({ variant, onSet }) => (
  <div className="kb-variant-tabs" role="tablist">
    {VARIANTS.map(v => (
      <button
        key={v.id}
        className={`kb-variant-tab${variant === v.id ? ' is-active' : ''}`}
        onClick={() => onSet(v.id)}
      >
        ▸ {v.label}
      </button>
    ))}
  </div>
);

const TweaksPanel = ({ open, onClose, tweaks, onSet }) => {
  const opt = (key, options) => (
    <div className="kb-tweaks-row">
      <div className="kb-tweaks-lbl">▸ {key.toUpperCase()}</div>
      <div className="kb-tweaks-opts">
        {options.map(o => (
          <button
            key={o.id}
            className={`kb-tweaks-btn${tweaks[key] === o.id ? ' is-active' : ''}`}
            onClick={() => onSet(key, o.id)}
          >{o.label}</button>
        ))}
      </div>
    </div>
  );
  return (
    <div className={`kb-tweaks${open ? ' is-open' : ''}`} data-screen-label="tweaks">
      <div className="kb-tweaks-head">
        <span>TWEAKS</span>
        <button className="kb-tweaks-close" onClick={onClose}>╳</button>
      </div>
      <div className="kb-tweaks-body">
        {opt('state', [{id:'fresh',label:'42 due'},{id:'clear',label:'clear'},{id:'behind',label:'behind'}])}
        {opt('accent', [{id:'cyan',label:'cyan+mag'},{id:'dim',label:'teal+rose'}])}
        {opt('scanlines', [{id:'off',label:'off'},{id:'on',label:'on'}])}
        {opt('density', [{id:'comfortable',label:'comfort'},{id:'compact',label:'compact'}])}
        {opt('hero', [{id:'on',label:'hero on'},{id:'off',label:'off'}])}
      </div>
    </div>
  );
};

const App = () => {
  const [tweaks, setTweaks] = React.useState(() => {
    try {
      const saved = localStorage.getItem('kb-tweaks');
      if (saved) return { ...TWEAK_DEFAULTS, ...JSON.parse(saved) };
    } catch(e) {}
    return TWEAK_DEFAULTS;
  });
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);

  React.useEffect(() => {
    document.body.dataset.accent = tweaks.accent;
    document.body.dataset.scanlines = tweaks.scanlines;
    document.body.dataset.density = tweaks.density;
    document.body.dataset.hero = tweaks.hero;
    try { localStorage.setItem('kb-tweaks', JSON.stringify(tweaks)); } catch(e) {}
  }, [tweaks]);

  // Host Tweaks integration
  React.useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode') {
        setEditMode(true);
        setTweaksOpen(true);
      } else if (e.data?.type === '__deactivate_edit_mode') {
        setEditMode(false);
        setTweaksOpen(false);
      }
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({type: '__edit_mode_available'}, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  const setTweak = (k, v) => {
    const next = { ...tweaks, [k]: v };
    setTweaks(next);
    try {
      window.parent.postMessage({type: '__edit_mode_set_keys', edits: {[k]: v}}, '*');
    } catch(e) {}
  };

  const onRun = () => {
    const btn = document.querySelector('.kb-run-primary');
    if (btn) {
      btn.style.transition = 'none';
      btn.style.transform = 'scale(.96)';
      btn.style.boxShadow = '0 0 40px rgba(34,211,238,.9), inset 0 0 0 2px var(--accent-cyan)';
      setTimeout(() => {
        window.location.href = 'Run.html';
      }, 160);
    } else {
      window.location.href = 'Run.html';
    }
  };

  const onPick = (id) => {
    const routes = { time: 'TimeAttack.html' };
    const target = CHALLENGES.find(c=>c.id===id)?.name;
    const nodes = document.querySelectorAll('.kb-chal');
    nodes.forEach(n => {
      if (n.querySelector('.kb-chal-name')?.textContent === target) {
        n.style.transition = 'none';
        n.style.boxShadow = '0 0 18px var(--accent-magenta)';
        n.style.borderColor = 'var(--accent-magenta)';
        setTimeout(() => {
          if (routes[id]) window.location.href = routes[id];
          else { n.style.transition=''; n.style.boxShadow=''; n.style.borderColor=''; }
        }, 200);
      }
    });
  };

  const variantClass = `kb-shell variant-${tweaks.variant}`;

  return (
    <>
      <div className={variantClass}>
        <Topbar state={tweaks.state} />
        <VariantTabs variant={tweaks.variant} onSet={(v) => setTweak('variant', v)} />

        <main className="kb-main" data-screen-label={`home-${tweaks.variant}`}>
          {tweaks.hero === 'on' && <Hero />}

          <Countdown state={tweaks.state} />

          <div className="kb-stats-row">
            <DuePanel state={tweaks.state} />
            <StreakPanel state={tweaks.state} />
          </div>

          {tweaks.variant === 'game' && <XpBar />}

          <div className="kb-section-head">
            <span className="kb-section-title">Primary run</span>
            <span className="kb-section-r">space · enter</span>
          </div>
          <RunPrimary state={tweaks.state} onRun={onRun} />

          <div className="kb-section-head">
            <span className="kb-section-title">Challenge modes</span>
            <span className="kb-section-r">alt / bonus xp</span>
          </div>
          <ChallengeGrid onPick={onPick} />

          <div style={{height: 8}} />
        </main>

        <StatusBar state={tweaks.state} />
      </div>

      {/* Floating Tweaks toggle (only shows when host edit mode off, to preview) */}
      {!editMode && (
        <button
          onClick={() => setTweaksOpen(o => !o)}
          style={{
            position:'fixed', right:12, bottom:12, zIndex:49,
            background:'var(--bg-1)', border:'1px solid var(--accent-cyan)',
            color:'var(--accent-cyan)', padding:'8px 12px',
            fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'.12em',
            textTransform:'uppercase', cursor:'pointer',
            boxShadow:'0 0 12px rgba(34,211,238,.35)',
          }}
        >
          ▸ tweaks
        </button>
      )}

      <TweaksPanel
        open={tweaksOpen}
        onClose={() => setTweaksOpen(false)}
        tweaks={tweaks}
        onSet={setTweak}
      />
    </>
  );
};

Object.assign(window, { App });
