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

const DECK_MAX = (typeof window !== 'undefined' && window.Daily?.DECK_SIZE) || 5;

const composeSub = (deck) => {
  const parts = [];
  if (deck.new)   parts.push(`new ${deck.new}`);
  if (deck.due)   parts.push(`review ${deck.due}`);
  if (deck.leech) parts.push(`leech ${deck.leech}`);
  return parts.join(' · ');
};

// DuePanel owns one question: "what's queued today and what's in it?"
// The midnight timer lives in <Countdown> right below — don't duplicate it here.
const DuePanel = ({ state, deck }) => {
  if (state === 'loading' || !deck) {
    return (
      <div className="kb-due" data-screen-label="due-panel">
        <div className="kb-due-head">
          <span className="kb-due-lbl">▸ DAILY QUEUE</span>
          <span className="kb-due-lbl">—</span>
        </div>
        <div className="kb-due-count dim">—<span className="unit">queued today</span></div>
        <div className="kb-due-sub">loading…</div>
        <div className="kb-due-seg">
          {Array.from({length: 12}).map((_, i) => <div key={i} className="kb-due-seg-s" />)}
        </div>
      </div>
    );
  }

  const total = deck.total;
  const isClear = total === 0;
  const cls = isClear ? 'dim' : 'cyan';
  const filledSegs = Math.round((total / DECK_MAX) * 12);
  const sub = isClear ? '✓ all caught up' : composeSub(deck);

  return (
    <div className="kb-due" data-screen-label="due-panel">
      <div className="kb-due-head">
        <span className="kb-due-lbl">▸ DAILY QUEUE</span>
        <span className="kb-due-lbl">{isClear ? 'cleared' : 'ready'}</span>
      </div>
      <div className={`kb-due-count ${cls}`}>
        {total}<span className="unit">queued today</span>
      </div>
      <div className="kb-due-sub">{sub}</div>
      <div className="kb-due-seg">
        {Array.from({length: 12}).map((_, i) => (
          <div key={i} className={`kb-due-seg-s${i < filledSegs ? ' is-filled' : ''}`} />
        ))}
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

// Rank table and rankFor() live in data/rank.js (loaded in every HTML).

const XpBar = ({ xp = 0 }) => {
  const R = window.Rank;
  const { cur, next, into, window: span, pct } = R
    ? R.getRankProgress(xp)
    : { cur: { label: 'RANK —', color: 'cyan', glyph: '·', threshold: 0 }, next: null, into: 0, window: 1, pct: 0 };
  return (
    <div className={`variant-xp tier-${cur.color}`} data-screen-label="xp-bar">
      <div className="variant-xp-head">
        <span>
          ▸ OPERATOR // <span className="rank">
            <span className="variant-xp-rank-glyph">{cur.glyph}</span>
            {cur.label}
          </span>
        </span>
        <span style={{color:'var(--accent-cyan)'}}>LIFETIME · {xp.toLocaleString()} XP</span>
      </div>
      <div className="variant-xp-bar"><div className="variant-xp-fill" style={{width:`${pct}%`}} /></div>
      <div className="variant-xp-meta">
        {next
          ? <><span>next: <b>{next.label}</b></span><span>{into.toLocaleString()} / {span.toLocaleString()} XP</span></>
          : <><span>— MAX RANK —</span><span>{xp.toLocaleString()} XP</span></>}
      </div>
    </div>
  );
};

Object.assign(window, { Hero, Countdown, DuePanel, StreakPanel, XpBar, formatCountdown, secondsUntilMidnight });
