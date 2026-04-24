// Pre-run and end screens

const formatHMS = (seconds) => {
  const s = Math.max(0, seconds | 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
};

const secondsUntilMidnightLocal = () => {
  const now = new Date();
  const mid = new Date(now);
  mid.setHours(24, 0, 0, 0);
  return Math.max(0, Math.floor((mid - now) / 1000));
};

// Mirrors RunCard.jsx VERDICTS for the pre-run legend. `int` already lives
// on the runtime button; `desc` is start-screen-only explainer copy.
const VERDICT_KEYS = [
  { id: 'miss', key: '1', label: 'MISS', desc: "didn't know · relearn in 6h",     int: 'lapse',        cls: 'miss' },
  { id: 'hard', key: '2', label: 'HARD', desc: 'correct, rough · slower growth',  int: 'next × 1.2',   cls: 'hard' },
  { id: 'ok',   key: '3', label: 'OK',   desc: 'solid recall · steady growth',    int: 'next × ease',  cls: 'ok'   },
  { id: 'easy', key: '4', label: 'EASY', desc: 'instant · accelerates the card',  int: 'next × 1.3+',  cls: 'easy' },
];

// composition: { new, due, leech, total } from the weighted deck selector.
const PreRun = ({ composition, onStart, isOverclock }) => {
  const c = composition || { new: 0, due: 0, leech: 0, total: 0 };
  const total = c.total || (c.new + c.due + c.leech);
  const bTotal = Math.max(1, c.new + c.due + c.leech);
  const estSec = total * 9; // rough: ~9s per card
  const estMin = Math.max(1, Math.round(estSec / 60));

  const hasNew    = c.new   > 0;
  const hasDue    = c.due   > 0;
  const hasLeech  = c.leech > 0;

  const title = isOverclock
    ? 'OVERCLOCK · EXTRA CYCLE'
    : total === 0
      ? 'NOTHING QUEUED'
      : hasNew && !hasDue && !hasLeech
        ? 'LEARN · FIRST KANJI'
        : hasLeech && !hasNew && !hasDue
          ? 'LEECH RECLAIM'
          : 'DAILY RUN · READY';
  const eyebrow = isOverclock ? '▸ OVERCLOCK · PAST THE LIMITER' : '▸ RUN · PRE-FLIGHT';

  return (
    <div className={`run-pre${isOverclock ? ' is-overclock' : ''}`} data-screen-label={isOverclock ? 'pre-overclock' : 'pre-run'}>
      <div className="run-pre-head">
        <div className="run-pre-lbl">{eyebrow}</div>
        <div className="run-pre-title">{title}</div>
        {isOverclock && (
          <div className="run-pre-overclock-sub">
            daily quota cleared · extra intake still grades into SRS · future reviews will climb
          </div>
        )}
      </div>

      {isOverclock && (
        <div className="run-pre-overclock-callout">
          <div className="run-pre-overclock-callout-row is-meta">
            <span className="run-pre-overclock-tag is-meta">▸</span>
            <span className="run-pre-overclock-msg">streak already locked in for today · verdicts still grade · fresh new kanji ahead</span>
          </div>
        </div>
      )}

      <div className="run-pre-stats">
        <div className="run-pre-stat">
          <div className="run-pre-stat-lbl">CARDS</div>
          <div className="run-pre-stat-val cyan">{total}</div>
        </div>
        <div className="run-pre-stat">
          <div className="run-pre-stat-lbl">EST TIME</div>
          <div className="run-pre-stat-val">~{estMin}m</div>
        </div>
        <div className="run-pre-stat">
          <div className="run-pre-stat-lbl">FLOW</div>
          <div className="run-pre-stat-val">
            {hasNew ? 'learn → quiz' : 'quiz'}
          </div>
        </div>
      </div>

      <div className="run-pre-breakdown">
        <div className="run-pre-breakdown-head">
          <span>▸ DECK COMPOSITION</span>
          <span>weighted · new · review · leech</span>
        </div>
        <div className="run-pre-breakdown-bar">
          <div className="new" style={{width: `${100*c.new/bTotal}%`}} />
          <div className="rev" style={{width: `${100*c.due/bTotal}%`}} />
          <div className="lch" style={{width: `${100*c.leech/bTotal}%`}} />
        </div>
        <div className="run-pre-legend">
          <span><span className="dot new" /><b>new</b>{c.new}</span>
          <span><span className="dot rev" /><b>review</b>{c.due}</span>
          <span><span className="dot lch" /><b>leech</b>{c.leech}</span>
        </div>
      </div>

      <div className="run-pre-verdicts">
        <div className="run-pre-verdicts-head">
          <span>▸ VERDICTS</span>
          <span>tap after reveal · keys 1–4</span>
        </div>
        <div className="run-pre-verdicts-grid">
          {VERDICT_KEYS.map(v => (
            <div key={v.id} className={`run-pre-vk ${v.cls}`}>
              <div className="run-pre-vk-head">
                <span className="k">{v.key}</span>
                <span className="l">{v.label}</span>
              </div>
              <div className="run-pre-vk-desc">{v.desc}</div>
              <div className="run-pre-vk-int">{v.int}</div>
            </div>
          ))}
        </div>
      </div>

      <button className="run-pre-start" onClick={onStart} disabled={total === 0}>
        <span>
          {total === 0 ? '▸ CHECK BACK AFTER MIDNIGHT'
            : isOverclock ? '▸ ENGAGE OVERCLOCK'
            : hasNew ? '▸ START LEARN'
            : '▸ RUN START'}
        </span>
        <span className="arrow">▸</span>
      </button>
      <div className="run-pre-hint kbd-hint">
        press <kbd>SPACE</kbd> to begin · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> for verdicts · <kbd>ESC</kbd> to quit
      </div>
    </div>
  );
};

// EndRun — fed real user data (streak, total_xp, xpGained) so nothing is faked.
const EndRun = ({ results, cards, duration, onHome, user, xpGained, isOverclock }) => {
  const counts = { miss:0, hard:0, ok:0, easy:0 };
  results.forEach(r => { if (counts[r] != null) counts[r]++; });
  const total = results.length;
  const hits = counts.ok + counts.easy + counts.hard;
  const acc = total === 0 ? 0 : Math.round(100 * hits / total);
  const mm = Math.floor(duration / 60), ss = duration % 60;
  const durStr = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  const xp = xpGained ?? 0;

  const missedCards = results.map((r, i) => ({r, c: cards[i]})).filter(x => x.r === 'miss');

  const streakDays = user?.current_streak ?? 0;
  const bestStreak = user?.best_streak ?? 0;
  const currentXp  = user?.total_xp ?? 0;
  const nextXp     = currentXp + xp;
  const [nextDrop, setNextDrop] = React.useState(secondsUntilMidnightLocal());
  React.useEffect(() => {
    const t = setInterval(() => setNextDrop(secondsUntilMidnightLocal()), 1000);
    return () => clearInterval(t);
  }, []);

  // Rank pulled from Dashboard.jsx (shared via window)
  const ranks = (typeof rankFor === 'function') ? rankFor(nextXp) : null;
  const curRank = ranks?.cur?.label || 'RANK —';
  const nextRank = ranks?.next || null;
  const toNext = nextRank ? Math.max(0, nextRank.min - nextXp) : null;
  // Map rank tier -> its accent so the XP panel label follows the ladder's
  // four-color arc instead of locking to magenta. Matches home.css .tier-*.
  const tierColor = ({
    cyan: 'var(--accent-cyan)',
    magenta: 'var(--accent-magenta)',
    amber: 'var(--accent-amber)',
    transcend: '#fefce8',
  })[ranks?.cur?.color] || 'var(--accent-cyan)';

  const streakDelta = streakDays > (user?._streakBefore ?? streakDays) ? '▲ +1' : null;

  return (
    <div className={`run-end${isOverclock ? ' is-overclock' : ''}`} data-screen-label={isOverclock ? 'overclock-end' : 'run-end'}>
      <div className="run-end-head">
        <div className="run-end-top">▸ {isOverclock ? 'OVERCLOCK END' : 'RUN END'} · {durStr}</div>
        <div className="run-end-title">{acc >= 80 ? 'CLEAN RUN' : acc >= 60 ? 'RUN COMPLETE' : 'ROUGH RUN'}</div>
        <div className="run-end-acc">{acc}<span className="pct">%</span></div>
      </div>
      <div className="run-end-tallies">
        <div className="run-end-t">
          <div className="run-end-t-lbl">MISS</div>
          <div className="run-end-t-val miss">{counts.miss}</div>
        </div>
        <div className="run-end-t">
          <div className="run-end-t-lbl">HARD</div>
          <div className="run-end-t-val hard">{counts.hard}</div>
        </div>
        <div className="run-end-t">
          <div className="run-end-t-lbl">OK</div>
          <div className="run-end-t-val ok">{counts.ok}</div>
        </div>
        <div className="run-end-t">
          <div className="run-end-t-lbl">EASY</div>
          <div className="run-end-t-val easy">{counts.easy}</div>
        </div>
      </div>
      <div className="run-end-panels">
        <div className="run-end-panel">
          <div className="run-end-p-head">
            <span>▸ STREAK</span>
            {streakDelta && <span className="kb-cyan" style={{color:'var(--accent-cyan)'}}>{streakDelta}</span>}
          </div>
          <div className="run-end-p-val streak">
            {streakDays}<span style={{fontSize:11,color:'var(--fg-2)',marginLeft:6,fontWeight:400,letterSpacing:'.12em',textTransform:'uppercase'}}>days</span>
          </div>
          <div className="run-end-p-sub">
            {streakDays === 0 ? 'streak starts tomorrow' : `best ${bestStreak}d · next drop ${formatHMS(nextDrop)}`}
          </div>
        </div>
        <div className="run-end-panel">
          <div className="run-end-p-head"><span>▸ XP GAINED</span><span style={{color: tierColor}}>{curRank.replace(/^RANK /, '')}</span></div>
          <div className="run-end-p-val xp">
            +{xp}<span style={{fontSize:11,color:'var(--fg-2)',marginLeft:6,fontWeight:400,letterSpacing:'.12em',textTransform:'uppercase'}}>xp</span>
          </div>
          <div className="run-end-p-sub">
            {currentXp.toLocaleString()} → {nextXp.toLocaleString()}
            {nextRank ? ` · ${toNext.toLocaleString()} to ${nextRank.label}` : ' · max rank'}
          </div>
        </div>
      </div>
      {missedCards.length > 0 && (
        <div className="run-end-missed">
          <div className="run-end-missed-head">
            <span>▸ LEECH CANDIDATES · {missedCards.length}</span>
            <span className="hot">queued for retry</span>
          </div>
          <div className="run-end-missed-grid">
            {missedCards.map((x, i) => (
              <div key={i} className="run-end-missed-k" title={x.c.mean}>
                {x.c.k}
                <span className="m">{x.c.mean.split(',')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{height: 16}} />
      <div className="run-end-actions">
        <button className="run-end-btn primary" onClick={onHome}>‹ HOME</button>
      </div>
    </div>
  );
};

// UndoChip — floats in the bottom-left during the 3-second window after
// a verdict. Ticks down visually so the user sees the undo disappearing.
// Verdict label is colour-coded so it's obvious which grade just landed.
const UndoChip = ({ verdict, onUndo, onExpire }) => {
  const [pct, setPct] = React.useState(100);
  const startRef = React.useRef(Date.now());
  React.useEffect(() => {
    startRef.current = Date.now();
    let raf;
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const remain = Math.max(0, 1 - elapsed / 3000);
      setPct(Math.round(remain * 100));
      if (remain > 0) raf = requestAnimationFrame(tick);
      else onExpire && onExpire();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <button className={`run-undo-chip verdict-${verdict}`} onClick={onUndo} aria-label="undo last verdict">
      <span className="run-undo-chip-icon" aria-hidden>↶</span>
      <span className="run-undo-chip-body">
        <span className="run-undo-chip-lbl">UNDO · <b>{verdict.toUpperCase()}</b></span>
        <span className="run-undo-chip-hint">tap · U · ⌫</span>
      </span>
      <span className="run-undo-chip-bar" style={{ transform: `scaleX(${pct/100})` }} aria-hidden />
    </button>
  );
};

Object.assign(window, { PreRun, EndRun, UndoChip });
