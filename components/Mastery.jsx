// Mastery — orchestrator for the Mastery page. Loads cards/states/sessions,
// computes every derived metric once, and routes to one of four view
// components based on user.settings.masteryView (also picker'd in Settings).
//
// The view switch is also exposed inline as a topbar segmented control so
// the user can flip between concepts without round-tripping Settings.

const MASTERY_VIEWS = [
  { id: 'core',          label: 'CORE',          glyph: '田' },
  { id: 'constellation', label: 'CONSTELLATION', glyph: '✦' },
  { id: 'instrument',    label: 'INSTRUMENT',    glyph: '◐' },
  { id: 'dossier',       label: 'DOSSIER',       glyph: '冊' },
];

const MASTERY_VIEW_DEFAULT = 'core';

const readMasteryView = (user) => {
  // Settings authoritatively store this on user.settings.masteryView. The
  // localStorage tweak mirror only fills in for users without a profile
  // record yet (first-boot before the user object lands).
  if (user && user.settings && MASTERY_VIEWS.some(v => v.id === user.settings.masteryView)) {
    return user.settings.masteryView;
  }
  try {
    const t = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
    if (MASTERY_VIEWS.some(v => v.id === t.masteryView)) return t.masteryView;
  } catch (e) {}
  return MASTERY_VIEW_DEFAULT;
};

const MasteryTopbar = ({ view, onView, summary }) => {
  const cleared = summary?.cleared ?? 0;
  const mature  = summary?.mature  ?? 0;
  return (
    <header className="kb-mastery-top">
      <a href="Home.html" className="kb-mastery-back">◂ home</a>
      <div className="kb-mastery-title">
        ▸ MASTERY <span className="kb-mastery-title-meta">// {cleared.toLocaleString()} cleared · {mature.toLocaleString()} mature</span>
      </div>
      <nav className="kb-mastery-tabs" role="tablist" aria-label="mastery view">
        {MASTERY_VIEWS.map(v => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className={`kb-mastery-tab${view === v.id ? ' is-active' : ''}`}
            onClick={() => onView(v.id)}
            title={v.label}
          >
            <span className="kb-mastery-tab-glyph" aria-hidden>{v.glyph}</span>
            <span className="kb-mastery-tab-lbl">{v.label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
};

// NOTE: named MasteryApp to avoid colliding with window.Mastery — that name
// is the data namespace defined in data/mastery.js (computeMastery,
// getMasteryRoster, …). Clobbering it with the component made every
// useMemo call in this orchestrator throw `undefined.computeMastery`.
const MasteryApp = ({ cards }) => {
  const [user, setUser]         = React.useState(null);
  const [states, setStates]     = React.useState(null);
  const [sessions, setSessions] = React.useState(null);
  const [view, setView]         = React.useState(MASTERY_VIEW_DEFAULT);

  React.useEffect(() => {
    if (!window.DB) return;
    let cancelled = false;
    window.DB.open()
      .then(() => Promise.all([
        window.DB.getUser(),
        window.DB.getAllCardStates(),
        window.DB.getRecentSessions(500),
      ]))
      .then(([u, st, ss]) => {
        if (cancelled) return;
        setUser(u);
        setStates(st || []);
        setSessions(ss || []);
        setView(readMasteryView(u));
      })
      .catch(() => { if (!cancelled) setStates([]); });
    return () => { cancelled = true; };
  }, []);

  // Persist view changes through Settings' storage path so a Settings open
  // shows the same selection. Writes both locations for robustness.
  const setViewPersisted = (id) => {
    setView(id);
    try {
      const cur = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
      localStorage.setItem('kb-tweaks', JSON.stringify({ ...cur, masteryView: id }));
    } catch (e) {}
    if (window.DB && user) {
      window.DB.updateSettings({ masteryView: id }).catch(() => {});
    }
  };

  const summary = React.useMemo(() => {
    if (!window.Mastery || !Array.isArray(states)) return null;
    return window.Mastery.computeMastery(cards, states, sessions);
  }, [cards, states, sessions]);

  const roster = React.useMemo(() => {
    if (!window.Mastery || !Array.isArray(states)) return [];
    return window.Mastery.getMasteryRoster(cards, states);
  }, [cards, states]);

  const breakdown = React.useMemo(() => {
    if (!window.Mastery || !roster.length) return [];
    return window.Mastery.getJlptBreakdown(roster);
  }, [roster]);

  const milestones = React.useMemo(() => {
    if (!window.Mastery || !Array.isArray(states)) return [];
    return window.Mastery.getRecentMilestones(cards, states, 12);
  }, [cards, states]);

  const calendar = React.useMemo(() => {
    if (!window.Mastery || !Array.isArray(states)) return [];
    return window.Mastery.getMaturationCalendar(states, 56);
  }, [states]);

  const velocity = React.useMemo(() => {
    if (!window.Mastery || !Array.isArray(sessions)) return [];
    return window.Mastery.getXpVelocity(sessions, 30);
  }, [sessions]);

  const loading = states === null;

  return (
    <div className="kb-shell variant-game kb-mastery-shell" data-view={view}>
      <MasteryTopbar view={view} onView={setViewPersisted} summary={summary} />

      <main className="kb-mastery-main" data-screen-label={`mastery-${view}`}>
        {loading && (
          <div className="kb-mastery-loading">▸ MOUNTING READOUT...</div>
        )}

        {!loading && (
          <MasteryViewBoundary key={view} viewKey={view}>
            {view === 'core' && window.MasteryCore && (
              <MasteryCore
                roster={roster}
                breakdown={breakdown}
                milestones={milestones}
              />
            )}

            {view === 'constellation' && window.MasteryConstellation && (
              <MasteryConstellation roster={roster} />
            )}

            {view === 'instrument' && window.MasteryInstrument && (
              <MasteryInstrument
                summary={summary}
                calendar={calendar}
                velocity={velocity}
                milestones={milestones}
              />
            )}

            {view === 'dossier' && window.MasteryDossier && (
              <MasteryDossier roster={roster} />
            )}
          </MasteryViewBoundary>
        )}
      </main>
    </div>
  );
};

// Render-time error boundary — function components can't catch their own
// render exceptions. Wrap each view so a thrown invariant surfaces as a
// readable panel inside the page shell instead of blanking it.
class MasteryViewBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) {
    try { console.error('[mastery] view render failed', err, info); } catch (e) {}
  }
  // The parent passes `key={view}` so this boundary remounts on a view
  // switch — that guarantees a poisoned view doesn't bleed into the next
  // one without us having to reset state imperatively.
  render() {
    if (this.state.err) {
      const e = this.state.err;
      const detail = (e && e.stack) || (e && e.message) || String(e);
      return (
        <section style={{
          background: 'rgba(0,0,0,.32)',
          border: '1px solid var(--accent-magenta)',
          padding: 14,
          marginTop: 12,
          fontFamily: 'var(--font-mono)',
        }}>
          <div style={{
            color: 'var(--accent-magenta)',
            fontSize: 12,
            letterSpacing: '.14em',
            marginBottom: 8,
          }}>
            ▸ VIEW RENDER FAILED · {this.props.viewKey || '?'}
          </div>
          <pre style={{
            whiteSpace: 'pre-wrap',
            color: 'var(--fg-1)',
            fontSize: 12,
            lineHeight: 1.5,
            margin: 0,
          }}>{detail}</pre>
          <div style={{ marginTop: 10, color: 'var(--fg-2)', fontSize: 11, letterSpacing: '.1em' }}>
            try a different view via the tabs above, or check Diagnostics for the capture-layer state
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}

Object.assign(window, { MasteryApp, MasteryViewBoundary, MASTERY_VIEWS, MASTERY_VIEW_DEFAULT });
