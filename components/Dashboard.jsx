// Hero + Boot + Stats components

const BOOT_LINES = [
  { t: '› mounting OPFS................', v: 'ok', c: 'ok' },
  { t: '› parsing stack (3 src)........', v: '4,821 cards', c: 'ok' },
  { t: '› srs schedule scan............', v: 'ok', c: 'ok' },
  { t: '› due queue.....................', v: null, c: 'dyn' },
  { t: '› ready.', v: null, c: null },
];

const BootBanner = ({ state, collapsed, onToggle }) => {
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    if (collapsed) return;
    if (step >= BOOT_LINES.length) return;
    const t = setTimeout(() => setStep(s => s + 1), step === 0 ? 120 : 140 + Math.random() * 80);
    return () => clearTimeout(t);
  }, [step, collapsed]);

  const dueDisplay = () => {
    if (state === 'clear') return { text: 'queue clear', c: 'ok' };
    if (state === 'behind') return { text: '180 overdue', c: 'amber' };
    return { text: '42 due', c: 'ok' };
  };
  const d = dueDisplay();

  const visibleLines = BOOT_LINES.slice(0, step + 1);

  return (
    <div className={`kb-boot${collapsed ? ' is-collapsed' : ''}`} onClick={collapsed ? onToggle : undefined}>
      <div className="kb-boot-head">
        <span>▸ BOOT · 0.3.1</span>
        <span className="kb-boot-head-r">{collapsed ? '▾ expand' : (step >= BOOT_LINES.length ? 'ready · tap to collapse' : 'mounting...')}</span>
      </div>
      {visibleLines.map((l, i) => {
        const isLast = i === step && step < BOOT_LINES.length - 1;
        const value = l.c === 'dyn' ? d.text : l.v;
        const valueClass = l.c === 'dyn' ? d.c : l.c;
        return (
          <div key={i} className={`kb-boot-line${isLast ? ' is-typing' : ''}`}>
            {l.t}
            {value && <span className={valueClass}>{value}</span>}
          </div>
        );
      })}
      {!collapsed && step >= BOOT_LINES.length && (
        <div className="kb-boot-line" onClick={onToggle} style={{cursor:'pointer', color:'var(--fg-2)', marginTop:4}}>
          › _<span style={{opacity:.5}}> tap to collapse</span>
        </div>
      )}
    </div>
  );
};

const KANJI_OF_DAY = {
  k: '刃',
  on: 'ジン',
  kun: 'は',
  mean: '"Blade · edge of a sword"',
  tag: 'JLPT N1 · 3 strokes',
};

const Hero = () => (
  <section className="kb-hero" data-screen-label="hero-kanji">
    <div className="kb-hero-strip">
      <span>▸ KANJI // today</span>
      <span className="mag">「{KANJI_OF_DAY.kun}」</span>
    </div>
    <div className="kb-hero-body">
      <div className="kb-hero-meta">
        <div className="kb-hero-reading">
          <span className="on">ON</span>{KANJI_OF_DAY.on}
        </div>
        <div className="kb-hero-reading">
          <span className="on">KUN</span>{KANJI_OF_DAY.kun}
        </div>
        <div className="kb-hero-mean">{KANJI_OF_DAY.mean}</div>
        <div className="kb-hero-tag">{KANJI_OF_DAY.tag}</div>
      </div>
      <div className="kb-hero-kanji" data-k={KANJI_OF_DAY.k}>{KANJI_OF_DAY.k}</div>
    </div>
  </section>
);

const formatCountdown = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

const Countdown = ({ state }) => {
  const initial = state === 'clear' ? 7 * 3600 + 14 * 60 : state === 'behind' ? 0 : 4 * 3600 + 22 * 60;
  const [sec, setSec] = React.useState(initial);
  React.useEffect(() => { setSec(initial); }, [state]);
  React.useEffect(() => {
    const t = setInterval(() => setSec(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  let lbl, val, cls = '';
  if (state === 'clear') { lbl = 'NEXT DROP // in'; val = 'queue clear. review any time.'; cls = 'is-clear'; }
  else if (state === 'behind') { lbl = 'OVERDUE // since 0700'; val = 'srs debt accumulating.'; cls = 'is-overdue'; }
  else { lbl = 'DUE REVIEW // in'; val = 'next card unlocks soon.'; cls = ''; }
  return (
    <div className={`kb-countdown ${cls}`}>
      <div className="kb-countdown-l">
        <div className="kb-countdown-lbl">{lbl}</div>
        <div className="kb-countdown-val">{val}</div>
      </div>
      <div className="kb-countdown-time">
        {state === 'clear' ? formatCountdown(sec) : state === 'behind' ? '+02:14' : formatCountdown(sec)}
      </div>
    </div>
  );
};

const DuePanel = ({ state }) => {
  const conf = {
    fresh: { count: 42, unit: 'due', segs: [1,1,1,1,1,1,0,0,0,0,0,0], sub: 'new 8 · review 34 · leech 3', cls: 'cyan' },
    clear: { count: 0, unit: 'due', segs: [], sub: 'queue clear. next drop 07:14:33', cls: 'dim' },
    behind: { count: 180, unit: 'overdue', segs: Array(12).fill(1), sub: 'new 22 · review 141 · leech 17', cls: 'amber' },
  }[state] || { count: 42, unit: 'due', segs: [1,1,1,1,1,1,0,0,0,0,0,0], sub: 'new 8 · review 34 · leech 3', cls: 'cyan' };

  return (
    <div className="kb-due" data-screen-label="due-panel">
      <div className="kb-due-head">
        <span className="kb-due-lbl">▸ DAILY QUEUE</span>
        <span className="kb-due-lbl">{state === 'behind' ? 'amber' : state === 'clear' ? 'clear' : 'green'}</span>
      </div>
      <div className={`kb-due-count ${conf.cls}`}>
        {conf.count}<span className="unit">{conf.unit}</span>
      </div>
      <div className="kb-due-sub">{conf.sub}</div>
      <div className="kb-due-seg">
        {Array.from({length: 12}).map((_, i) => {
          const filled = conf.segs[i];
          const isAmber = state === 'behind' && filled;
          return <div key={i} className={`kb-due-seg-s${filled ? (isAmber ? ' is-amber' : ' is-filled') : ''}`} />;
        })}
      </div>
    </div>
  );
};

const StreakPanel = ({ state }) => {
  const days = state === 'behind' ? 0 : state === 'clear' ? 12 : 12;
  const best = 28;
  return (
    <div className="kb-streak" data-screen-label="streak-panel">
      <div className="kb-streak-flame">
        <span /><span /><span /><span />
      </div>
      <div className="kb-streak-lbl">▸ STREAK</div>
      <div className="kb-streak-val">
        {days}<span className="unit">d</span>
      </div>
      <div className="kb-streak-sub">{days === 0 ? 'broken · restart today' : `best · ${best}d`}</div>
    </div>
  );
};

const XpBar = () => (
  <div className="variant-xp">
    <div className="variant-xp-head">
      <span>▸ OPERATOR // <span className="rank">RANK Ⅲ · ADEPT</span></span>
      <span style={{color:'var(--accent-cyan)'}}>2,140 XP</span>
    </div>
    <div className="variant-xp-bar"><div className="variant-xp-fill" style={{width:'68%'}} /></div>
    <div className="variant-xp-meta">
      <span>next: <b>RANK Ⅳ · SAVANT</b></span>
      <span>680 / 1000 XP</span>
    </div>
  </div>
);

Object.assign(window, { BootBanner, Hero, Countdown, DuePanel, StreakPanel, XpBar });
