// Top-level home app — shell, topbar, dashboard
// Appearance preferences (scanlines/hero) live in Settings. Accent is locked
// to the cyan+magenta brand pair and density is locked to compact — neither
// is user-tweakable. The `game` visual variant is shipped — no alternates
// are user-selectable.

const TWEAK_DEFAULTS = {
  scanlines: 'off',
  hero: 'on',
};

// ───── Watermark typewriter greeting ─────────────────────────────────
// Plays once per tab session (sessionStorage gate). Greeting is picked
// based on streak state — praise on active streaks, jab when the chain
// broke, a dedicated line for brand-new operators, otherwise a silly
// generic. Keep phrases < ~40 chars so they fit the topbar on narrow
// viewports without eating the live clock.

const WM_TITLE = 'kanji-buddy';

const pickGreeting = (name, streak, lastSessionIso) => {
  const n = (name || 'operator').toLowerCase();
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today.getTime() - 86400000);
  const last = lastSessionIso ? new Date(lastSessionIso) : null;
  if (last) last.setHours(0,0,0,0);

  const onStreak    = (streak || 0) >= 2 && last && last >= yesterday;
  const freshBoot   = !last;
  const brokeChain  = !freshBoot && (!last || last < yesterday);

  const praise = [
    `welcome back, ${n}. streak live.`,
    `${n} online. ${streak}d run intact.`,
    `daily driver ${n} reporting in.`,
    `${n}. ${streak} days unbroken.`,
    `${n}. kernel primed. stack ${streak}.`,
  ];
  const harsh = [
    `${n}. streak zeroed. again.`,
    `the kanji have not forgotten, ${n}.`,
    `${n}? barely recognized you.`,
    `decay detected on operator ${n}.`,
    `oh. you came back, ${n}.`,
    `${n}. chain broken. rebuild.`,
  ];
  const firstBoot = [
    `${n} online. first cycle.`,
    `handshake accepted, ${n}.`,
    `new operator ${n}. welcome to the grid.`,
    `${n}. boot sequence complete.`,
  ];
  const silly = [
    `booting ${n}.exe ...`,
    `the kanji missed you, ${n}.`,
    `${n}. caffeine: assumed adequate.`,
    `stand by, ${n}. samurai mode.`,
    `do not feed the leeches, ${n}.`,
    `${n}. forecast: 100% kanji.`,
    `memory palace unlocked, ${n}.`,
    `${n}. the neon never sleeps.`,
    `${n}. hydrate before kanji.`,
    `${n}. brain gym is open.`,
    `${n}. 忘れないで。`,
  ];

  const pool = [...silly];
  if (freshBoot)  pool.push(...firstBoot, ...firstBoot, ...firstBoot); // weight heavily on first boot
  if (onStreak)   pool.push(...praise, ...praise);
  if (brokeChain) pool.push(...harsh, ...harsh);
  return pool[Math.floor(Math.random() * pool.length)];
};

const useGreeting = (user) => {
  const [text, setText]       = React.useState(WM_TITLE);
  const [typing, setTyping]   = React.useState(false);
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (fired.current) return;
    if (!user || !user.display_name) return;
    try { if (sessionStorage.getItem('kb-greeted') === '1') return; } catch(e) {}
    fired.current = true;
    try { sessionStorage.setItem('kb-greeted', '1'); } catch(e) {}

    const greet = pickGreeting(user.display_name, user.current_streak || 0, user.last_session_date);
    const TYPE = 48, BACK = 26, HOLD = 2100, GAP = 220, START = 300;

    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));

    at(START, () => { setText(''); setTyping(true); });

    let t = START + TYPE;
    for (let i = 1; i <= greet.length; i++) { const slice = greet.slice(0, i); at(t, () => setText(slice)); t += TYPE; }
    t += HOLD;
    for (let i = greet.length - 1; i >= 0; i--) { const slice = greet.slice(0, i); at(t, () => setText(slice)); t += BACK; }
    t += GAP;
    for (let i = 1; i <= WM_TITLE.length; i++) { const slice = WM_TITLE.slice(0, i); at(t, () => setText(slice)); t += TYPE; }
    at(t + 150, () => setTyping(false));

    return () => timers.forEach(clearTimeout);
  }, [user]);

  return [text, typing];
};

const readTweaks = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
    return { ...TWEAK_DEFAULTS, ...saved };
  } catch(e) { return { ...TWEAK_DEFAULTS }; }
};

const deriveState = (deck) => {
  if (!deck) return 'loading';
  if (deck.total === 0) return 'clear';
  return 'active';
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
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{
              background:'var(--bg-0)', border:'1px solid var(--accent-cyan)',
              color:'var(--fg-0)', padding:'10px 12px',
              fontFamily:'var(--font-mono)', fontSize:16,
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

// Three states the streak can be in:
//   hot    — last session was TODAY → streak is live and already counted.
//            Particulate sparks render to celebrate it.
//   cold   — last session was YESTERDAY and streak ≥ 1 → still alive but
//            today's activity hasn't been recorded yet. Dim, no sparks,
//            tooltip nudges the user to keep it.
//   broken — last session ≥ 2 days ago, or streak === 0 → next session
//            will reset. Red error glow, count shown crossed-out.
//   fresh  — brand-new user with no sessions on file. Quiet.
const computeStreakState = (user) => {
  const days = user?.current_streak ?? 0;
  const lastIso = user?.last_session_date;
  if (!lastIso && days === 0) return { state: 'fresh', days: 0 };
  const last = new Date(lastIso); last.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (last.getTime() === today.getTime())     return { state: 'hot',    days };
  if (last.getTime() === yesterday.getTime() && days >= 1) return { state: 'cold', days };
  return { state: 'broken', days };
};

const StreakChip = ({ user }) => {
  const { state, days } = computeStreakState(user);
  if (state === 'fresh') {
    return (
      <span className="kb-streak-chip is-fresh" title="no streak yet · finish today's daily run to start one">
        <span className="kb-streak-chip-icon" aria-hidden>·</span>
        <span className="kb-streak-chip-lbl">start</span>
        <span className="kb-streak-chip-num">—</span>
      </span>
    );
  }
  // Hot visuals scale with streak length — a 2-day warmup should look
  // different from a 30-day monster. `is-milestone` gates the shimmer
  // sweep so early streaks feel earned when it eventually kicks in.
  const milestone = state === 'hot' && days >= 7;
  const meta = {
    hot:    { icon: '火', cls: 'is-hot',    title: `${days}-day streak · counted for today` },
    cold:   { icon: '·',  cls: 'is-cold',   title: `${days}-day streak · do today's run before midnight to keep it` },
    broken: { icon: '✕',  cls: 'is-broken', title: `${days}-day streak broken · next session resets to 1` },
  }[state];
  // Spark count tiers by streak length so the pill gets visibly busier
  // as the run gets longer. Staggered delays so they don't fire in sync.
  let sparks = [];
  if (state === 'hot') {
    const base = [
      { sx: '14%', sd: '0s',    sv: '24px' },
      { sx: '50%', sd: '1.1s',  sv: '28px' },
      { sx: '82%', sd: '2.0s',  sv: '26px' },
    ];
    const extra = [
      { sx: '30%', sd: '.6s',   sv: '30px' },
      { sx: '68%', sd: '1.6s',  sv: '32px' },
    ];
    sparks = days >= 3 ? [...base, ...extra] : base;
  }
  return (
    <span
      className={`kb-streak-chip ${meta.cls}${milestone ? ' is-milestone' : ''}`}
      title={meta.title}
    >
      <span className="kb-streak-chip-icon" aria-hidden>{meta.icon}</span>
      <span className="kb-streak-chip-lbl">streak</span>
      <span className="kb-streak-chip-num">
        {days}<span className="kb-streak-chip-unit">d</span>
      </span>
      {sparks.map((s, i) => (
        <span
          key={i}
          className="kb-streak-spark"
          style={{'--sx': s.sx, '--sd': s.sd, '--sv': s.sv}}
          aria-hidden
        />
      ))}
    </span>
  );
};

const Topbar = ({ displayName, user }) => {
  const [time, setTime] = React.useState(() => new Date());
  const [wm, typing]    = useGreeting(user);
  React.useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 10000);
    return () => clearInterval(t);
  }, []);
  const hhmm = time.toTimeString().slice(0,5).replace(':','');
  return (
    <header className={`kb-top${typing ? ' is-greeting' : ''}`}>
      <div className={`kb-wm${typing ? ' is-typing' : ''}`}>{wm}</div>
      <div className="kb-top-right" aria-hidden={typing ? 'true' : undefined}>
        <StreakChip user={user} />
        <span style={{color:'var(--fg-2)'}}>{displayName || '—'}</span>
        <span>{hhmm}</span>
        <a href="Settings.html" className="kb-top-cog" aria-label="settings">⚙</a>
      </div>
    </header>
  );
};

const App = ({ cards }) => {
  const [tweaks] = React.useState(readTweaks);
  const [user, setUser] = React.useState(null);
  const [userLoaded, setUserLoaded] = React.useState(false);
  const [deck, setDeck] = React.useState(null);       // {new, due, leech, total} — today's Run preview
  const [reviewedToday, setReviewedToday] = React.useState(0); // intraday progress for the queue bar
  const [cardStates, setCardStates] = React.useState(null); // full card_states for ProgressPanel tier math
  const [promotion, setPromotion] = React.useState(null);

  React.useEffect(() => {
    if (!window.Rank) return;
    const p = window.Rank.consumePromotion();
    if (p) setPromotion(p);
  }, []);

  React.useEffect(() => {
    // Drop any ?reset=TS left over from a hard-reset redirect.
    try {
      if (window.location.search) {
        history.replaceState(null, '', window.location.pathname);
      }
    } catch(e) {}

    if (!window.DB) { setUserLoaded(true); return; }
    window.DB.open()
      .then(() => window.DB.getUser())
      .then(u => {
        setUser(u || null);
        setUserLoaded(true);
      })
      .catch(() => { setUser(null); setUserLoaded(true); });
  }, []);

  React.useEffect(() => {
    if (!window.DB || !window.Daily || !cards || !cards.length) return;
    window.DB.open()
      .then(() => window.DB.getAllCardStates())
      .then(states => {
        setCardStates(states);
        const todayStr = new Date().toDateString();
        const reviewed = states.filter(s =>
          s.last_reviewed && new Date(s.last_reviewed).toDateString() === todayStr
        ).length;
        setReviewedToday(reviewed);

        // Gate: once today's quota is met, queue is clear until next midnight —
        // prevents the ~2000-card "new" pool from endlessly refilling the panel.
        const dailyDone = reviewed >= window.Daily.DECK_SIZE;
        const picks = dailyDone ? [] : window.Daily.selectDailyDeck(cards, states);
        setDeck({
          new:   picks.filter(c => c._bucket === 'new').length,
          due:   picks.filter(c => c._bucket === 'due').length,
          leech: picks.filter(c => c._bucket === 'leech').length,
          total: picks.length,
        });
      })
      .catch(() => {});
  }, [cards]);

  React.useEffect(() => {
    document.body.dataset.scanlines = tweaks.scanlines;
    document.body.dataset.hero = tweaks.hero;
  }, [tweaks]);

  const state = deriveState(deck);

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
      const over = btn.classList.contains('is-overachiever');
      btn.style.transition = 'none';
      btn.style.transform = 'scale(.96)';
      btn.style.animation = 'none';
      btn.style.boxShadow = over
        ? '0 0 48px rgba(255,61,255,.9), inset 0 0 0 2px var(--accent-magenta)'
        : '0 0 40px rgba(34,211,238,.9), inset 0 0 0 2px var(--accent-cyan)';
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

  const variantClass = 'kb-shell variant-game';

  return (
    <>
      {userLoaded && !user && (
        <FirstRunModal onDone={(name) => setUser({ display_name: name })} />
      )}
      {promotion && window.RankUpModal && (
        <RankUpModal
          from={promotion.from}
          to={promotion.to}
          totalXp={user?.total_xp ?? 0}
          onClose={() => setPromotion(null)}
        />
      )}
      <div className={variantClass}>
        <Topbar displayName={user?.display_name} user={user} />

        <main className="kb-main" data-screen-label="home">
          {tweaks.hero === 'on' && <Hero kanji={todayKanji} />}

          <Countdown state={state} />

          <div className="kb-stats-row">
            <DuePanel state={state} deck={deck} reviewedToday={reviewedToday} />
            <ProgressPanel cards={cards} states={cardStates} />
          </div>

          <XpBar xp={user?.total_xp ?? 0} />

          <div className="kb-section-head">
            <span className="kb-section-title">Primary run</span>
            <span className="kb-section-r">space · enter</span>
          </div>
          <RunPrimary state={state} deck={deck} onRun={onRun} />

          <div className="kb-section-head">
            <span className="kb-section-title">Challenge modes</span>
            <span className="kb-section-r">alt / bonus xp</span>
          </div>
          <ChallengeGrid onPick={onPick} hotId={hotChallengeId} dailyDone={state === 'clear'} />

          <div className="kb-section-head">
            <span className="kb-section-title">Jōyō ladder</span>
            <span className="kb-section-r">N5 → N1</span>
          </div>
          <LadderBar cards={cards} states={cardStates} />

          <div style={{height: 8}} />
        </main>
      </div>
    </>
  );
};

Object.assign(window, { App });
