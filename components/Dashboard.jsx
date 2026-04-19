// Hero + Stats components

const Hero = ({ kanji }) => {
  // `kanji` comes from cards.json: { k, mainOn, mainKun, mean, jlpt, strokes, ... }
  if (!kanji) {
    return (
      <section className="kb-hero" data-screen-label="hero-kanji">
        <div className="kb-hero-strip">
          <span>▸ KANJI // today</span>
          <span className="mag">「—」</span>
        </div>
        <div className="kb-hero-body">
          <div className="kb-hero-meta"><div className="kb-hero-tag">loading…</div></div>
          <div className="kb-hero-kanji">·</div>
        </div>
      </section>
    );
  }
  const on = kanji.mainOn || '—';
  const kun = kanji.mainKun || '—';
  const mean = kanji.mean ? `"${kanji.mean}"` : '';
  const jlptLbl = kanji.jlpt ? `JLPT N${kanji.jlpt}` : 'JLPT —';
  const strokeLbl = kanji.strokes ? `${kanji.strokes} strokes` : '';
  const tag = [jlptLbl, strokeLbl].filter(Boolean).join(' · ');
  return (
    <section className="kb-hero" data-screen-label="hero-kanji">
      <div className="kb-hero-strip">
        <span>▸ KANJI // today</span>
        <span className="mag">「{kun}」</span>
      </div>
      <div className="kb-hero-body">
        <div className="kb-hero-meta">
          <div className="kb-hero-reading">
            <span className="on">ON</span>{on}
          </div>
          <div className="kb-hero-reading">
            <span className="on">KUN</span>{kun}
          </div>
          {mean && <div className="kb-hero-mean">{mean}</div>}
          <div className="kb-hero-tag">{tag}</div>
        </div>
        <div className="kb-hero-kanji" data-k={kanji.k}>{kanji.k}</div>
      </div>
    </section>
  );
};

const formatCountdown = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

// Seconds until next local midnight — "daily drop" time.
const secondsUntilMidnight = () => {
  const now = new Date();
  const mid = new Date(now);
  mid.setHours(24, 0, 0, 0);
  return Math.max(0, Math.floor((mid - now) / 1000));
};

const Countdown = ({ state }) => {
  const [sec, setSec] = React.useState(secondsUntilMidnight);
  React.useEffect(() => {
    const t = setInterval(() => setSec(secondsUntilMidnight()), 1000);
    return () => clearInterval(t);
  }, []);
  let lbl, val, cls = '';
  if (state === 'clear') {
    lbl = 'NEXT DROP // in'; val = 'queue clear · review any time';
    cls = 'is-clear';
  } else if (state === 'behind') {
    lbl = 'OVERDUE // srs debt'; val = 'catch up before the next drop';
    cls = 'is-overdue';
  } else {
    lbl = 'NEXT DROP // in'; val = 'new reviews unlock at 00:00';
  }
  return (
    <div className={`kb-countdown ${cls}`}>
      <div className="kb-countdown-l">
        <div className="kb-countdown-lbl">{lbl}</div>
        <div className="kb-countdown-val">{val}</div>
      </div>
      <div className="kb-countdown-time">{formatCountdown(sec)}</div>
    </div>
  );
};

const DuePanel = ({ state, dueCount }) => {
  const conf = {
    fresh: { count: 42, unit: 'due', segs: [1,1,1,1,1,1,0,0,0,0,0,0], sub: 'new 8 · review 34 · leech 3', cls: 'cyan' },
    clear: { count: 0,  unit: 'due', segs: [], sub: 'queue clear. next drop 07:14:33', cls: 'dim' },
    behind: { count: 180, unit: 'overdue', segs: Array(12).fill(1), sub: 'new 22 · review 141 · leech 17', cls: 'amber' },
  }[state] || { count: 42, unit: 'due', segs: [1,1,1,1,1,1,0,0,0,0,0,0], sub: 'new 8 · review 34 · leech 3', cls: 'cyan' };

  const realCount = dueCount !== null ? dueCount : conf.count;
  const realCls   = realCount === 0 ? 'dim' : realCount > 100 ? 'amber' : 'cyan';
  const filledSegs = Math.round((realCount / Math.max(realCount, 42)) * 12);
  const realSegs   = dueCount !== null
    ? Array.from({length: 12}, (_, i) => i < filledSegs ? 1 : 0)
    : conf.segs;

  return (
    <div className="kb-due" data-screen-label="due-panel">
      <div className="kb-due-head">
        <span className="kb-due-lbl">▸ DAILY QUEUE</span>
        <span className="kb-due-lbl">{realCount === 0 ? 'clear' : realCount > 100 ? 'amber' : 'green'}</span>
      </div>
      <div className={`kb-due-count ${realCls}`}>
        {realCount}<span className="unit">{conf.unit}</span>
      </div>
      <div className="kb-due-sub">{dueCount !== null ? `${realCount} cards due now` : conf.sub}</div>
      <div className="kb-due-seg">
        {Array.from({length: 12}).map((_, i) => {
          const filled = realSegs[i];
          const isAmber = realCls === 'amber' && filled;
          return <div key={i} className={`kb-due-seg-s${filled ? (isAmber ? ' is-amber' : ' is-filled') : ''}`} />;
        })}
      </div>
    </div>
  );
};

const StreakPanel = ({ streak, bestStreak }) => {
  const days = streak ?? 0;
  const best = bestStreak ?? 0;
  const subCopy = days === 0
    ? (best === 0 ? 'no streak yet · start today' : `broken · best ${best}d`)
    : (days >= best ? `new best · ${days}d` : `best · ${best}d`);
  return (
    <div className="kb-streak" data-screen-label="streak-panel">
      <div className="kb-streak-flame">
        <span /><span /><span /><span />
      </div>
      <div className="kb-streak-lbl">▸ STREAK</div>
      <div className="kb-streak-val">
        {days}<span className="unit">d</span>
      </div>
      <div className="kb-streak-sub">{subCopy}</div>
    </div>
  );
};

const RANK_TABLE = [
  { min:     0, label: 'RANK Ⅰ · NOVICE' },
  { min:   250, label: 'RANK Ⅱ · APPRENTICE' },
  { min:  1000, label: 'RANK Ⅲ · ADEPT' },
  { min:  2500, label: 'RANK Ⅳ · SAVANT' },
  { min:  5000, label: 'RANK Ⅴ · MASTER' },
  { min: 10000, label: 'RANK Ⅵ · SENSEI' },
  { min: 20000, label: 'RANK Ⅶ · LEGEND' },
];

const rankFor = (xp) => {
  let cur = RANK_TABLE[0];
  let next = RANK_TABLE[1] || null;
  for (let i = 0; i < RANK_TABLE.length; i++) {
    if (xp >= RANK_TABLE[i].min) {
      cur = RANK_TABLE[i];
      next = RANK_TABLE[i + 1] || null;
    }
  }
  return { cur, next };
};

const XpBar = ({ xp = 0 }) => {
  const { cur, next } = rankFor(xp);
  const floor = cur.min;
  const ceil = next ? next.min : cur.min;
  const span = Math.max(1, ceil - floor);
  const into = Math.max(0, xp - floor);
  const pct = next ? Math.min(100, Math.round((into / span) * 100)) : 100;
  return (
    <div className="variant-xp">
      <div className="variant-xp-head">
        <span>▸ OPERATOR // <span className="rank">{cur.label}</span></span>
        <span style={{color:'var(--accent-cyan)'}}>{xp.toLocaleString()} XP</span>
      </div>
      <div className="variant-xp-bar"><div className="variant-xp-fill" style={{width:`${pct}%`}} /></div>
      <div className="variant-xp-meta">
        {next
          ? <><span>next: <b>{next.label}</b></span><span>{into.toLocaleString()} / {span.toLocaleString()} XP</span></>
          : <><span>max rank reached</span><span>{xp.toLocaleString()} XP</span></>}
      </div>
    </div>
  );
};

Object.assign(window, { Hero, Countdown, DuePanel, StreakPanel, XpBar, RANK_TABLE, rankFor });
