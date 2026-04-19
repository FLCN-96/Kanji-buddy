// Settings — display name + appearance preferences. Writes to localStorage and DB.

const TWEAK_DEFAULTS = {
  accent: 'cyan',
  scanlines: 'off',
  density: 'comfortable',
  hero: 'on',
};

const readTweaks = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
    return { ...TWEAK_DEFAULTS, ...saved };
  } catch(e) { return { ...TWEAK_DEFAULTS }; }
};

const applyBodyDataset = (tw) => {
  document.body.dataset.accent = tw.accent;
  document.body.dataset.scanlines = tw.scanlines;
  document.body.dataset.density = tw.density;
  document.body.dataset.hero = tw.hero;
};

const SettingsTopbar = ({ displayName }) => {
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
        <span style={{color:'var(--fg-2)'}}>{displayName || '—'}</span>
        <span>{hhmm}</span>
      </div>
    </header>
  );
};

const OptRow = ({ label, value, options, onSet }) => (
  <div className="kb-set-row">
    <div className="kb-set-lbl">▸ {label}</div>
    <div className="kb-set-opts">
      {options.map(o => (
        <button
          key={o.id}
          className={`kb-set-btn${value === o.id ? ' is-active' : ''}`}
          onClick={() => onSet(o.id)}
        >{o.label}</button>
      ))}
    </div>
  </div>
);

const HOLD_MS = 2000;

const DangerZone = () => {
  const [phase, setPhase] = React.useState('closed'); // closed | armed | wiping | done
  const [held, setHeld] = React.useState(0);
  const holdRef = React.useRef(null);
  const startRef = React.useRef(0);

  React.useEffect(() => () => cancelAnimationFrame(holdRef.current), []);

  const pressStart = () => {
    startRef.current = performance.now();
    setHeld(0);
    const tick = (t) => {
      const elapsed = t - startRef.current;
      const pct = Math.min(1, elapsed / HOLD_MS);
      setHeld(pct);
      if (pct >= 1) {
        setPhase('wiping');
        performWipe();
        return;
      }
      holdRef.current = requestAnimationFrame(tick);
    };
    holdRef.current = requestAnimationFrame(tick);
  };
  const pressEnd = () => {
    cancelAnimationFrame(holdRef.current);
    if (phase !== 'wiping') setHeld(0);
  };

  const performWipe = async () => {
    try {
      if (window.DB) await window.DB.resetAllData();
      try { localStorage.removeItem('kb-tweaks'); } catch(e) {}
      // clear any mode-local PB / tweak caches
      ['kb-ta-pb','kb-sv-pb','kb-sg-pb','kb-lh-pb','kb-mt-pb',
       'kb-sv-tweaks','kb-sg-tweaks','kb-lh-tweaks','kb-mt-tweaks'].forEach(k => {
        try { localStorage.removeItem(k); } catch(e) {}
      });
      setPhase('done');
      setTimeout(() => { window.location.href = 'Home.html'; }, 900);
    } catch(e) {
      console.error('reset failed', e);
      setPhase('closed');
    }
  };

  if (phase === 'closed') {
    return (
      <section className="kb-danger" data-screen-label="danger-zone">
        <div className="kb-danger-head">
          <span className="kb-danger-skull">☠</span>
          <div>
            <div className="kb-danger-title">DANGER ZONE</div>
            <div className="kb-danger-sub">wipes operator, streak, sessions, scores</div>
          </div>
          <button className="kb-danger-arm" onClick={() => setPhase('armed')}>
            ▸ initialize purge
          </button>
        </div>
      </section>
    );
  }

  if (phase === 'done') {
    return (
      <section className="kb-danger is-done">
        <div className="kb-danger-head">
          <span className="kb-danger-skull ok">✓</span>
          <div>
            <div className="kb-danger-title">PURGE COMPLETE</div>
            <div className="kb-danger-sub">returning to first boot...</div>
          </div>
        </div>
      </section>
    );
  }

  const pct = Math.round(held * 100);
  return (
    <section className={`kb-danger is-armed${phase === 'wiping' ? ' is-wiping' : ''}`}>
      <div className="kb-danger-armed-head">
        <span className="kb-danger-skull pulse">☠</span>
        <div className="kb-danger-armed-text">
          <div className="kb-danger-title alert">ALL OPERATOR DATA WILL BE ERASED</div>
          <div className="kb-danger-sub">irreversible · name, streak, scores, sessions, card state</div>
        </div>
      </div>
      <div className="kb-danger-actions">
        <button className="kb-danger-cancel" onClick={() => { pressEnd(); setPhase('closed'); }}>
          ◂ cancel
        </button>
        <button
          className="kb-danger-confirm"
          onMouseDown={pressStart} onMouseUp={pressEnd} onMouseLeave={pressEnd}
          onTouchStart={pressStart} onTouchEnd={pressEnd} onTouchCancel={pressEnd}
          disabled={phase === 'wiping'}
        >
          <span className="kb-danger-confirm-fill" style={{ width: `${pct}%` }} />
          <span className="kb-danger-confirm-label">
            {phase === 'wiping' ? '▸ WIPING...' : `✕ HOLD TO CONFIRM ${pct}%`}
          </span>
        </button>
      </div>
    </section>
  );
};

// HardResetSwitch — full browser-state nuke for when the PWA gets wedged.
// Flip the yellow hazard-striped safety cover to arm the big red button.
// Press → delete IndexedDB, unregister SW, clear caches + local/session
// storage, hard-reload bypassing cache.
const HardResetSwitch = () => {
  const [armed, setArmed] = React.useState(false);
  const [firing, setFiring] = React.useState(false);
  const [errorOpen, setErrorOpen] = React.useState(false);

  const performHardReset = async () => {
    setFiring(true);
    try {
      // 1. Close our open DB handle so deleteDatabase isn't blocked.
      if (window.DB && window.DB.close) window.DB.close();

      // 2. Unregister every service worker registration.
      if ('serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister().catch(() => {})));
        } catch(e) {}
      }

      // 3. Delete every Cache Storage bucket.
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
        } catch(e) {}
      }

      // 4. Delete the IndexedDB database entirely.
      await new Promise(resolve => {
        try {
          const req = indexedDB.deleteDatabase('kanji-buddy-db');
          req.onsuccess = () => resolve();
          req.onerror   = () => resolve();
          req.onblocked = () => resolve();
        } catch(e) { resolve(); }
      });

      // 5. Clear every client-side storage.
      try { localStorage.clear();   } catch(e) {}
      try { sessionStorage.clear(); } catch(e) {}

      // 6. Navigate to Home with a cache-busting query so the browser
      //    doesn't serve any lingering resource from memory.
      const bust = Date.now();
      const base = window.location.pathname.replace(/[^/]*$/, '');
      window.location.replace(`${base}Home.html?reset=${bust}`);
    } catch(e) {
      setFiring(false);
      setErrorOpen(true);
    }
  };

  return (
    <section className="kb-nuke" data-screen-label="nuclear-reset">
      <div className="kb-nuke-hazard" aria-hidden />
      <div className="kb-nuke-head">
        <span className="kb-nuke-lbl">⚠ HARD RESET · PHYSICAL OVERRIDE</span>
        <span className="kb-nuke-sub">last-resort nuke · wipes db, cache, sw, storage · reloads</span>
      </div>

      <div className={`kb-nuke-switch${armed ? ' is-armed' : ''}`}>
        <button
          className="kb-nuke-cover"
          onClick={() => setArmed(a => !a)}
          aria-pressed={armed}
          disabled={firing}
        >
          <span className="kb-nuke-cover-grip" />
          <span className="kb-nuke-cover-label">
            {armed ? '▾ GUARD OPEN · click to close' : '▴ FLIP SAFETY GUARD TO ARM'}
          </span>
          <span className="kb-nuke-cover-grip" />
        </button>

        <div className="kb-nuke-well">
          <button
            className={`kb-nuke-btn${firing ? ' is-firing' : ''}`}
            onClick={performHardReset}
            disabled={!armed || firing}
            aria-label="hard reset — detonate"
          >
            <span className="kb-nuke-btn-ring" aria-hidden />
            <span className="kb-nuke-btn-core">
              {firing ? '⟳' : 'RESET'}
            </span>
          </button>
          <div className="kb-nuke-readout">
            {firing
              ? '▸ DETONATING · unregistering service worker · clearing caches · deleting database...'
              : armed
                ? '▸ ARMED · press RESET to detonate'
                : '▸ SAFE · cover closed'}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={errorOpen}
        tone="info"
        title="RESET FAILED"
        body="Try closing the tab and reopening."
        confirmLabel="OK"
        onConfirm={() => setErrorOpen(false)}
      />
    </section>
  );
};

const Settings = () => {
  const [tweaks, setTweaks] = React.useState(readTweaks);
  const [user, setUser] = React.useState(null);
  const [nameDraft, setNameDraft] = React.useState('');
  const [savedFlash, setSavedFlash] = React.useState(false);

  React.useEffect(() => {
    if (!window.DB) return;
    window.DB.open()
      .then(() => window.DB.getUser())
      .then(u => {
        setUser(u);
        setNameDraft(u?.display_name || '');
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    applyBodyDataset(tweaks);
    try { localStorage.setItem('kb-tweaks', JSON.stringify(tweaks)); } catch(e) {}
  }, [tweaks]);

  const setKey = (k) => (v) => setTweaks(t => ({ ...t, [k]: v }));

  const saveName = async () => {
    const n = nameDraft.trim();
    if (!n || !window.DB) return;
    if (user) {
      await window.DB.updateUser({ display_name: n });
    } else {
      await window.DB.createUser(n);
    }
    const u = await window.DB.getUser();
    setUser(u);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const resetDefaults = () => setTweaks({ ...TWEAK_DEFAULTS });

  const variantClass = 'kb-shell variant-game';

  return (
    <div className={variantClass}>
      <SettingsTopbar displayName={user?.display_name} />

      <main className="kb-main kb-set-main" data-screen-label="settings">
        <div className="kb-set-head">
          <a href="Home.html" className="kb-set-back">◂ home</a>
          <span className="kb-set-title">▸ SETTINGS // operator config</span>
          <span className="kb-set-ver">v0.3.1</span>
        </div>

        <section className="kb-set-section">
          <div className="kb-set-section-head">▸ OPERATOR</div>
          <div className="kb-set-row">
            <div className="kb-set-lbl">▸ DISPLAY NAME</div>
            <div className="kb-set-name">
              <input
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                maxLength={24}
                placeholder="operator"
                className="kb-set-input"
              />
              <button
                className="kb-set-save"
                onClick={saveName}
                disabled={!nameDraft.trim() || nameDraft === user?.display_name}
              >{savedFlash ? '✓ saved' : 'save'}</button>
            </div>
          </div>
        </section>

        <section className="kb-set-section">
          <div className="kb-set-section-head">▸ APPEARANCE</div>
          <OptRow label="ACCENT" value={tweaks.accent} onSet={setKey('accent')}
            options={[{id:'cyan',label:'cyan+mag'},{id:'dim',label:'teal+rose'}]} />
          <OptRow label="SCANLINES" value={tweaks.scanlines} onSet={setKey('scanlines')}
            options={[{id:'off',label:'off'},{id:'on',label:'on'}]} />
          <OptRow label="DENSITY" value={tweaks.density} onSet={setKey('density')}
            options={[{id:'comfortable',label:'comfort'},{id:'compact',label:'compact'}]} />
          <OptRow label="HERO CARD" value={tweaks.hero} onSet={setKey('hero')}
            options={[{id:'on',label:'on'},{id:'off',label:'off'}]} />
        </section>

        <div className="kb-set-foot">
          <button className="kb-set-reset" onClick={resetDefaults}>▸ reset appearance to defaults</button>
        </div>

        <DangerZone />
        <HardResetSwitch />
      </main>
    </div>
  );
};

Object.assign(window, { Settings });
