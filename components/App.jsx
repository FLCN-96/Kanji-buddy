// Top-level home app — shell, topbar, dashboard
// Appearance preferences (scanlines/hero) live in Settings. Accent is locked
// to the cyan+magenta brand pair and density is locked to compact — neither
// is user-tweakable. The `game` visual variant is shipped — no alternates
// are user-selectable.

const TWEAK_DEFAULTS = {
  scanlines: 'off',
  hero: 'on',
  romaji: 'off',
};

// ───── Watermark typewriter greeting ─────────────────────────────────
// Plays once per tab session (sessionStorage gate). Greeting is picked
// based on streak state — praise on active streaks, jab when the chain
// broke, a dedicated line for brand-new operators, otherwise a silly
// generic. Keep phrases < ~40 chars so they fit the topbar on narrow
// viewports without eating the live clock.

const WM_TITLE = 'kanji-buddy';
// Version chip rendered alongside the watermark once the greeting
// finishes. Dev / unstamped builds get nothing rather than "vdev".
const KB_VERSION_LABEL = (() => {
  const v = window.KBVersion && window.KBVersion.version;
  return v && v !== 'dev' ? `v${v}` : '';
})();

const pickGreeting = (name, streak, lastSessionIso) => {
  const n = (name || 'operator').toLowerCase();
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today.getTime() - 86400000);
  const last = lastSessionIso ? new Date(lastSessionIso) : null;
  if (last) last.setHours(0,0,0,0);

  const onStreak    = (streak || 0) >= 2 && last && last >= yesterday;
  const freshBoot   = !last;
  const brokeChain  = !freshBoot && (!last || last < yesterday);
  // Just-crossed-a-tier flavor: one-day-after a milestone (the chip's still
  // hot from the modal). Fires only for hot+near-milestone counts.
  const milestoneish = onStreak && [7, 8, 10, 11, 30, 31, 50, 51, 100, 101, 365, 366].includes(streak);

  const praise = [
    `welcome back, ${n}. streak live.`,
    `${n} online. ${streak}d run intact.`,
    `daily driver ${n} reporting in.`,
    `${n}. ${streak} days unbroken.`,
    `${n}. kernel primed. stack ${streak}.`,
    `${n}. discipline: stable. carry on.`,
    `${n}. ${streak}-day uptime. respect.`,
    `${n}. the chain holds.`,
    `signal lock confirmed, ${n}.`,
    `${n}. compounding interest, day ${streak}.`,
    `${n}. routine compiled. shipping.`,
    `operator ${n}. still in the seat.`,
    `${n}. no detected drift.`,
    `${n}. heartbeat nominal.`,
  ];
  const harsh = [
    `${n}. streak zeroed. again.`,
    `the kanji have not forgotten, ${n}.`,
    `${n}? barely recognized you.`,
    `decay detected on operator ${n}.`,
    `oh. you came back, ${n}.`,
    `${n}. chain broken. rebuild.`,
    `${n}. retention decay non-trivial.`,
    `${n}. resuming from cold cache.`,
    `${n}. you owe the deck an apology.`,
    `${n}. the leeches multiplied without you.`,
    `${n}. recovery protocol: review heavy.`,
    `${n}. attendance: spotty.`,
    `welcome back, stranger ${n}.`,
    `${n}. days since last session: too many.`,
  ];
  const firstBoot = [
    `${n} online. first cycle.`,
    `handshake accepted, ${n}.`,
    `new operator ${n}. welcome to the grid.`,
    `${n}. boot sequence complete.`,
    `${n}. registering operator profile.`,
    `${n}. day zero. let's go.`,
    `${n}. the deck has been waiting.`,
  ];
  const milestone = [
    `${n}. milestone holding.`,
    `${n}. ${streak}-day badge active.`,
    `${n}. tier cleared. encore.`,
    `${n}. you've earned the glow.`,
    `${n}. veterans only past this point.`,
    `${n}. 継続は力なり。`,
    `${n}. ${streak}d club: founding member.`,
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
    `${n}. stretching the hippocampus.`,
    `${n}. press any key to summon kanji.`,
    `${n}. radical acceptance enabled.`,
    `${n}. kanji.exe has stopped procrastinating.`,
    `${n}. neon synapses warming up.`,
    `${n}. one more readthrough won't hurt.`,
    `${n}. friendly reminder: 漢字 are friends.`,
    `${n}. ghost in the dictionary.`,
    `${n}. caching memories…`,
    `${n}. ink not yet dry.`,
    `${n}. today's brand of confidence: artisanal.`,
  ];

  const pool = [...silly];
  if (freshBoot)    pool.push(...firstBoot, ...firstBoot, ...firstBoot); // weight heavily on first boot
  if (onStreak)     pool.push(...praise, ...praise);
  if (milestoneish) pool.push(...milestone, ...milestone, ...milestone);
  if (brokeChain)   pool.push(...harsh, ...harsh);
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

// Animates the chip count from `from` → `to` over ~600 ms. Used after a
// continued-streak flag fires so the user sees the number tick up rather
// than silently jump on first paint.
const useCountUp = (from, to, ms = 600) => {
  const [val, setVal] = React.useState(from);
  React.useEffect(() => {
    if (from === to) { setVal(to); return; }
    const start = performance.now();
    let raf;
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, ms]);
  return val;
};

const StreakChip = ({ user, burst, onTap }) => {
  const { state, days } = computeStreakState(user);

  // A5: tick-up only when a continued flag was consumed AND we have a prior
  // count to roll from. Otherwise render the static count.
  const continuedFrom = burst?.continued?.prevStreak;
  const animateFrom = (typeof continuedFrom === 'number' && continuedFrom < days) ? continuedFrom : days;
  const shown = useCountUp(animateFrom, days, 700);

  // One-shot burst classes — auto-clear after their longest animation duration
  // so re-mounts don't re-fire them and so they can stack with steady-state
  // styling (is-hot etc.).
  const [oneShot, setOneShot] = React.useState({ continued: false, broken: false, best: false });
  React.useEffect(() => {
    if (!burst) return;
    setOneShot({
      continued: !!burst.continued,
      broken:    !!burst.broken,
      best:      !!burst.best,
    });
    const t = setTimeout(() => setOneShot({ continued: false, broken: false, best: false }), 4200);
    return () => clearTimeout(t);
  }, [burst]);

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
    hot:    { icon: '火', cls: 'is-hot',    title: `${days}-day streak · counted for today · tap for history` },
    cold:   { icon: '·',  cls: 'is-cold',   title: `${days}-day streak · do today's run before midnight to keep it · tap for history` },
    broken: { icon: '✕',  cls: 'is-broken', title: `${days}-day streak broken · next session resets to 1 · tap for history` },
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
  const burstCls = [
    oneShot.continued ? 'is-puff'   : '',
    oneShot.broken    ? 'is-shake'  : '',
    oneShot.best      ? 'is-best'   : '',
  ].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={`kb-streak-chip ${meta.cls}${milestone ? ' is-milestone' : ''}${burstCls ? ' ' + burstCls : ''}`}
      title={meta.title}
      onClick={onTap}
    >
      <span className="kb-streak-chip-icon" aria-hidden>{meta.icon}</span>
      <span className="kb-streak-chip-lbl">streak</span>
      <span className="kb-streak-chip-num">
        {shown}<span className="kb-streak-chip-unit">d</span>
      </span>
      {sparks.map((s, i) => (
        <span
          key={i}
          className="kb-streak-spark"
          style={{'--sx': s.sx, '--sd': s.sd, '--sv': s.sv}}
          aria-hidden
        />
      ))}
      {oneShot.best && (
        <span className="kb-streak-best-twinkle" aria-hidden>✦</span>
      )}
      {oneShot.continued && (
        <span className="kb-streak-puff" aria-hidden />
      )}
    </button>
  );
};

const Topbar = ({ displayName, user, burst, onStreakTap, onVersionTap }) => {
  const [wm, typing] = useGreeting(user);
  return (
    <header className={`kb-top${typing ? ' is-greeting' : ''}`}>
      <div className="kb-wm-group">
        <div className={`kb-wm${typing ? ' is-typing' : ''}`}>{wm}</div>
        {KB_VERSION_LABEL && (
          <button
            type="button"
            className={`kb-wm-ver${typing ? ' is-hidden' : ''}`}
            aria-label={`build ${KB_VERSION_LABEL} · changelog`}
            title="tap for changelog"
            onClick={onVersionTap}
          >
            {KB_VERSION_LABEL}
          </button>
        )}
      </div>
      <div className="kb-top-right" aria-hidden={typing ? 'true' : undefined}>
        <StreakChip user={user} burst={burst} onTap={onStreakTap} />
        <span style={{color:'var(--fg-2)'}}>{displayName || '—'}</span>
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
  const [picks, setPicks] = React.useState([]);       // actual cards selected — feeds DeckBreakdownPopover
  const [reviewedToday, setReviewedToday] = React.useState(0); // intraday progress for the queue bar
  const [cardStates, setCardStates] = React.useState(null); // full card_states for ProgressPanel tier math
  const [promotion, setPromotion] = React.useState(null);
  // One-shot streak event payloads consumed once on mount. The chip uses
  // these to render A1 (puff), A2 (shake), A4 (twinkle) effects; the
  // milestone payload triggers StreakMilestoneModal.
  const [streakBurst, setStreakBurst] = React.useState({ continued: null, broken: null, best: null });
  const [streakMilestone, setStreakMilestone] = React.useState(null);
  // Tap-for-detail popover state. Single string indicating which is open;
  // null = none. Keep it lifted so opening one closes the others.
  const [openPop, setOpenPop] = React.useState(null);
  // Optional payload for popovers that need it (e.g. ladder tier).
  const [popPayload, setPopPayload] = React.useState(null);

  React.useEffect(() => {
    if (window.Rank) {
      const p = window.Rank.consumePromotion();
      if (p) setPromotion(p);
    }
    if (window.Streak) {
      const cont = window.Streak.consumeContinued();
      const brok = window.Streak.consumeBroken();
      const best = window.Streak.consumeBest();
      const milestone = window.Streak.consumeMilestone();
      if (cont || brok || best) setStreakBurst({ continued: cont, broken: brok, best: best });
      if (milestone) setStreakMilestone(milestone);
    }
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
      .then(() => Promise.all([window.DB.getUser(), window.DB.getAllCardStates()]))
      .then(([u, states]) => {
        setCardStates(states);
        const todayStr = new Date().toDateString();
        const reviewed = states.filter(s =>
          s.last_reviewed && new Date(s.last_reviewed).toDateString() === todayStr
        ).length;
        setReviewedToday(reviewed);

        // Gate: once today's quota is met, queue is clear until next midnight —
        // prevents the ~2000-card "new" pool from endlessly refilling the panel.
        const deckSize = window.Daily.resolveDeckSize(u);
        const dailyDone = reviewed >= deckSize;
        const todaysPicks = dailyDone ? [] : window.Daily.selectDailyDeck(cards, states, deckSize);
        setPicks(todaysPicks);
        setDeck({
          new:   todaysPicks.filter(c => c._bucket === 'new').length,
          due:   todaysPicks.filter(c => c._bucket === 'due').length,
          leech: todaysPicks.filter(c => c._bucket === 'leech').length,
          total: todaysPicks.length,
          size:  deckSize,
        });
      })
      .catch(() => {});
  }, [cards]);

  React.useEffect(() => {
    document.body.dataset.scanlines = tweaks.scanlines;
    document.body.dataset.hero = tweaks.hero;
    document.body.dataset.romaji = tweaks.romaji;
  }, [tweaks]);

  const state = deriveState(deck);

  // Daily picks — deterministic per local day
  const seed = React.useMemo(() => window.Daily.daySeed(), []);
  const todayKanji = React.useMemo(() => {
    if (!cards || !cards.length) return null;
    return cards[seed % cards.length];
  }, [cards, seed]);
  const hotChallengeId = React.useMemo(() => window.Daily.hotChallengeId(), []);
  // Hot tier flips from gold → silver after the first hot run completes.
  // We re-read on visibilitychange so a user returning from a challenge sees
  // the downgrade immediately without a hard refresh.
  const [hotTier, setHotTier] = React.useState(() =>
    window.Daily ? window.Daily.hotTier(hotChallengeId) : null
  );
  React.useEffect(() => {
    const refresh = () => {
      if (!window.Daily) return;
      setHotTier(window.Daily.hotTier(hotChallengeId));
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [hotChallengeId]);

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
  const openPanePop = (kind, payload = null) => { setPopPayload(payload); setOpenPop(kind); };
  const closePop = () => { setOpenPop(null); setPopPayload(null); };
  const forecastByDay = React.useMemo(
    () => (window.computeForecast ? window.computeForecast(cardStates || [], new Date()).byDay : new Map()),
    [cardStates]
  );

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
      {streakMilestone && window.StreakMilestoneModal && (
        <StreakMilestoneModal
          milestone={streakMilestone.milestone}
          days={user?.current_streak ?? streakMilestone.milestone.n}
          bestStreak={user?.best_streak ?? 0}
          onClose={() => setStreakMilestone(null)}
        />
      )}
      {openPop === 'changelog' && window.ChangelogPopover && (
        <ChangelogPopover onClose={closePop} />
      )}
      {openPop === 'streak-history' && window.StreakHistoryPopover && (
        <StreakHistoryPopover user={user} onClose={closePop} />
      )}
      {openPop === 'rank-ladder' && window.RankLadderModal && (
        <RankLadderModal totalXp={user?.total_xp ?? 0} onClose={closePop} />
      )}
      {openPop === 'forecast' && window.ForecastDetailPopover && (
        <ForecastDetailPopover byDay={forecastByDay} onClose={closePop} />
      )}
      {openPop === 'deck' && window.DeckBreakdownPopover && (
        <DeckBreakdownPopover deck={deck} picks={picks} onClose={closePop} />
      )}
      {openPop === 'leech' && window.LeechListPopover && (
        <LeechListPopover cards={cards} states={cardStates} onClose={closePop} />
      )}
      {openPop === 'hero' && window.HeroDetailPopover && (
        <HeroDetailPopover card={todayKanji} onClose={closePop} />
      )}
      {openPop === 'ladder-tier' && window.LadderTierPopover && (
        <LadderTierPopover tier={popPayload} cards={cards} states={cardStates} onClose={closePop} />
      )}

      <div className={variantClass}>
        <Topbar
          displayName={user?.display_name}
          user={user}
          burst={streakBurst}
          onStreakTap={() => openPanePop('streak-history')}
          onVersionTap={() => openPanePop('changelog')}
        />

        <main className="kb-main kb-main-staggered" data-screen-label="home">
          {tweaks.hero === 'on' && (
            <div className="kb-pane-wrap" onClick={() => openPanePop('hero')} title="tap for stroke order + full examples">
              <Hero kanji={todayKanji} />
            </div>
          )}

          <Countdown state={state} />

          <div className="kb-stats-row">
            <div className="kb-pane-wrap" onClick={() => openPanePop('deck')} title="tap to see what's in today's deck">
              <DuePanel state={state} deck={deck} reviewedToday={reviewedToday} />
            </div>
            <div className="kb-pane-wrap" onClick={() => openPanePop('forecast')} title="tap for the 30-day forecast">
              <ProgressPanel cards={cards} states={cardStates} />
            </div>
          </div>

          <div className="kb-pane-wrap" onClick={() => openPanePop('leech')} title="tap for the full leech list">
            <LeechPanel cards={cards} states={cardStates} />
          </div>

          <div className="kb-pane-wrap" onClick={() => openPanePop('rank-ladder')} title="tap for the full rank ladder">
            <XpBar xp={user?.total_xp ?? 0} />
          </div>

          <div className="kb-section-head">
            <span className="kb-section-title">Primary run</span>
            <span className="kb-section-r">space · enter</span>
          </div>
          <RunPrimary state={state} deck={deck} onRun={onRun} />

          <div className="kb-section-head">
            <span className="kb-section-title">Challenge modes</span>
            <span className="kb-section-r">alt / bonus xp</span>
          </div>
          <ChallengeGrid onPick={onPick} hotId={hotChallengeId} hotTier={hotTier} dailyDone={state === 'clear'} />

          <div className="kb-section-head">
            <span className="kb-section-title">Jōyō ladder</span>
            <span className="kb-section-r">N5 → N1</span>
          </div>
          <LadderBar cards={cards} states={cardStates} onTierTap={(tier) => openPanePop('ladder-tier', tier)} />

          <div style={{height: 8}} />
        </main>
      </div>
    </>
  );
};

Object.assign(window, { App });
