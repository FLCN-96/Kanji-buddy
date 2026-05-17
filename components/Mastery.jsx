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

const Mastery = ({ cards }) => {
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

        {!loading && view === 'core' && window.MasteryCore && (
          <MasteryCore
            roster={roster}
            breakdown={breakdown}
            milestones={milestones}
          />
        )}

        {!loading && view === 'constellation' && window.MasteryConstellation && (
          <MasteryConstellation roster={roster} />
        )}

        {!loading && view === 'instrument' && window.MasteryInstrument && (
          <MasteryInstrument
            summary={summary}
            calendar={calendar}
            velocity={velocity}
            milestones={milestones}
          />
        )}

        {!loading && view === 'dossier' && window.MasteryDossier && (
          <MasteryDossier roster={roster} />
        )}
      </main>
    </div>
  );
};

Object.assign(window, { Mastery, MASTERY_VIEWS, MASTERY_VIEW_DEFAULT });
