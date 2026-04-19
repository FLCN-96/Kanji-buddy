// Top-level home app — shell, topbar, dashboard
// Appearance preferences (variant/accent/scanlines/density/hero) live in Settings.

const TWEAK_DEFAULTS = {
  variant: 'hud',
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

const deriveState = (dueCount) => {
  if (dueCount === null || dueCount === undefined) return 'fresh';
  if (dueCount === 0) return 'clear';
  if (dueCount > 100) return 'behind';
  return 'fresh';
};

// Daily rotation helpers come from window.Daily (data/daily.js).

const FirstRunModal = ({ onDone }) => {
  const [name, setName] = React.useState('');
  const submit = (e) => {
    e.preventDefault();
    const n = name.trim() || 'Operator';
    window.DB.createUser(n).then(() => onDone(n));
  };
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200,
      background:'rgba(10,14,20,.92)', backdropFilter:'blur(4px)',
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <div style={{
        background:'var(--bg-1)', border:'1px solid var(--accent-cyan)',
        padding:'32px 28px', maxWidth:340, width:'90%',
        boxShadow:'0 0 40px rgba(0,229,255,.2)',
        fontFamily:'var(--font-mono)',
      }}>
        <div style={{color:'var(--accent-cyan)',fontSize:11,letterSpacing:'.15em',marginBottom:20}}>
          ▸ FIRST BOOT // initialize operator
        </div>
        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:12}}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="operator name"
            autoFocus
            maxLength={24}
            style={{
              background:'var(--bg-0)', border:'1px solid var(--accent-cyan)',
              color:'var(--fg-0)', padding:'10px 12px',
              fontFamily:'var(--font-mono)', fontSize:14,
              outline:'none', letterSpacing:'.05em',
            }}
          />
          <button type="submit" style={{
            background:'var(--accent-cyan)', border:'none',
            color:'var(--bg-0)', padding:'10px', fontFamily:'var(--font-mono)',
            fontSize:12, letterSpacing:'.15em', textTransform:'uppercase',
            cursor:'pointer', fontWeight:700,
          }}>
            INITIALIZE
          </button>
        </form>
      </div>
    </div>
  );
};

const Topbar = ({ displayName }) => {
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
        <a href="Settings.html" className="kb-top-cog" aria-label="settings">⚙</a>
      </div>
    </header>
  );
};

const StatusBar = ({ totalCards, dueCount }) => {
  const due = dueCount ?? 0;
  const cls = due === 0 ? 'kb-dim' : due > 100 ? 'kb-amb' : 'kb-cyan';
  return (
    <footer className="kb-statusbar">
      <div className="kb-statusbar-l">
        <span>CARDS · <b>{totalCards ? totalCards.toLocaleString() : '—'}</b></span>
        <span className={cls}>DUE · <b>{due}</b></span>
      </div>
      <span>v0.3.1</span>
    </footer>
  );
};

const App = ({ cards }) => {
  const [tweaks] = React.useState(readTweaks);
  const [user, setUser] = React.useState(null);
  const [userLoaded, setUserLoaded] = React.useState(false);
  const [dueCount, setDueCount] = React.useState(null);

  React.useEffect(() => {
    if (!window.DB) { setUserLoaded(true); return; }
    window.DB.open()
      .then(() => window.DB.getUser())
      .then(u => {
        setUser(u);
        setUserLoaded(true);
      })
      .catch(() => setUserLoaded(true));
    window.DB.getDueCards()
      .then(cs => setDueCount(cs.length))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    document.body.dataset.accent = tweaks.accent;
    document.body.dataset.scanlines = tweaks.scanlines;
    document.body.dataset.density = tweaks.density;
    document.body.dataset.hero = tweaks.hero;
  }, [tweaks]);

  const state = deriveState(dueCount);

  // Daily picks — deterministic per local day
  const seed = React.useMemo(() => window.Daily.daySeed(), []);
  const todayKanji = React.useMemo(() => {
    if (!cards || !cards.length) return null;
    return cards[seed % cards.length];
  }, [cards, seed]);
  const hotChallengeId = React.useMemo(() => window.Daily.hotChallengeId(), []);

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
    const routes = { time: 'TimeAttack.html', survival: 'Survival.html', streak: 'StreakGuard.html', leech: 'LeechHunt.html', match: 'Match.html' };
    const target = CHALLENGES.find(c => c.id === id)?.name;
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
      {userLoaded && !user && (
        <FirstRunModal onDone={(name) => setUser({ display_name: name })} />
      )}
      <div className={variantClass}>
        <Topbar displayName={user?.display_name} />

        <main className="kb-main" data-screen-label={`home-${tweaks.variant}`}>
          {tweaks.hero === 'on' && <Hero kanji={todayKanji} />}

          <Countdown state={state} />

          <div className="kb-stats-row">
            <DuePanel state={state} dueCount={dueCount} />
            <StreakPanel state={state} streak={user?.current_streak} bestStreak={user?.best_streak} />
          </div>

          {tweaks.variant === 'game' && <XpBar xp={user?.total_xp ?? 0} />}

          <div className="kb-section-head">
            <span className="kb-section-title">Primary run</span>
            <span className="kb-section-r">space · enter</span>
          </div>
          <RunPrimary state={state} onRun={onRun} />

          <div className="kb-section-head">
            <span className="kb-section-title">Challenge modes</span>
            <span className="kb-section-r">alt / bonus xp</span>
          </div>
          <ChallengeGrid onPick={onPick} hotId={hotChallengeId} />

          <div style={{height: 8}} />
        </main>

        <StatusBar totalCards={cards?.length} dueCount={dueCount} />
      </div>
    </>
  );
};

Object.assign(window, { App });
