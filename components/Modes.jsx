// Mode selection: primary RUN + challenge grid
// CHALLENGES carry an average XP hint shown on the tile. Actual per-session
// XP is performance-based and computed inside each mode's orchestrator.
// A "HOT" pick is chosen per day and triples that mode's XP; HOT floats up.

const CHALLENGES = [
  { id: 'time',     glyph: '秒', name: 'TIME ATTACK',   sub: '60s · max cards',           ascii: '■■■■□□□□ 60s', xp: 150 },
  { id: 'survival', glyph: '命', name: 'SURVIVAL',      sub: '1 miss · run ends',         ascii: '♥ ♥ ♥ → ╳',   xp: 120 },
  { id: 'streak',   glyph: '忘', name: 'STREAK GUARD',  sub: '12 cards about to leak',    ascii: '▮▮▮▮▯▯ 12',    xp: 90  },
  { id: 'leech',    glyph: '蛭', name: 'LEECH HUNT',    sub: '3 worst + 1 stretch bounty', ascii: '☠ × 4',        xp: 100 },
  { id: 'match',    glyph: '合', name: 'MATCH',         sub: '60s · pair kanji ↔ meaning', ascii: '[字]→[char]',  xp: 90  },
  { id: 'decipher', glyph: '解', name: 'DECIPHER',      sub: 'key the word · 5 lives',     ascii: '□ □ □ → 解',   xp: 110 },
  { id: 'trace',    glyph: '筆', name: 'TRACE',         sub: 'stroke order · muscle memory', ascii: '✎ 一→二→三',  xp: 90  },
  { id: 'glyph',    glyph: '郭', name: 'GLYPH',         sub: 'place components by quadrant', ascii: '日｜月 → 明',  xp: 90  },
];

// HOT tile uses Daily.HOT_GOLD / HOT_SILVER directly for the badge math so the
// numbers stay in lock-step with the multiplier system. The tile reads the
// claim status off Daily.hotTier(id) — the parent passes hotTier in.

// Cipher-rotating text — flips through scramble glyphs and resolves toward
// `target`, one slot at a time. Used for the INJECT label so it reads as
// unstable/corrupted rather than just stylized. Re-resolves periodically so
// the effect loops without the user needing to look away.
const SCRAMBLE_GLYPHS = '#@%&$*?!§¥+=<>/\\|×';
const useCipherText = (target, opts) => {
  const o = opts || {};
  const tickMs   = o.tickMs   || 70;
  const lockMs   = o.lockMs   || 90;   // ms per character to "lock"
  const idleMs   = o.idleMs   || 1900; // hold fully-resolved for this long
  const rescramble = o.rescramble != null ? o.rescramble : true;

  const [out, setOut] = React.useState(target);
  React.useEffect(() => {
    if (!target) return;
    let cancelled = false;
    const len = target.length;
    let phase = 'scramble'; // scramble | hold
    let resolvedUntil = 0;  // index up to which letters are locked
    let lastReveal = performance.now();
    let holdUntil = 0;
    const rand = () => SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)];

    const tick = () => {
      if (cancelled) return;
      const now = performance.now();
      if (phase === 'hold') {
        if (now >= holdUntil) {
          phase = 'scramble';
          resolvedUntil = 0;
          lastReveal = now;
        }
      } else {
        if (now - lastReveal >= lockMs && resolvedUntil < len) {
          resolvedUntil += 1;
          lastReveal = now;
        }
        if (resolvedUntil >= len) {
          if (rescramble) {
            phase = 'hold';
            holdUntil = now + idleMs;
          }
        }
      }
      let s = '';
      for (let i = 0; i < len; i++) s += i < resolvedUntil ? target[i] : rand();
      setOut(s);
    };

    const id = setInterval(tick, tickMs);
    tick();
    return () => { cancelled = true; clearInterval(id); };
  }, [target, tickMs, lockMs, idleMs, rescramble]);
  return out;
};

// InjectSlot — post-daily side modes. Lives just above ChallengeGrid.
//   • locked    — daily run not yet complete. Padlock cross-fades with
//                 "REQUIRES DAILY" copy; tile is non-interactive.
//   • overclock — daily done, no STREAK INJECT snapshot. Optional extra cycle.
//   • inject    — daily done, snapshot present. Chain-recovery offer.
// Daily-run launching itself has moved to <DailyStrip> on Home, so this tile
// no longer owns the primary CTA — only the post-daily branches.
const InjectSlot = ({ dailyDone, inject, onInject, onRun }) => {
  const locked       = !dailyDone;
  const isInject     = !!inject && dailyDone;
  const overachiever = dailyDone && !isInject;

  const injectOddsPct = isInject ? Math.round((inject.odds || 0) * 100) : 0;

  // Locked state — keep label slot empty so the cipher hook stays quiet.
  const topLabel = locked       ? null
                 : isInject     ? '▸ STREAK.RECOVER() // chain corrupted'
                 : '▸ EXTRA CYCLE? · entirely optional';
  const label    = isInject     ? 'STREAK INJECT'
                 : overachiever ? 'OVERCLOCK'
                 : '';
  const subCopy  = isInject     ? `chain @ ${inject.lostStreak}d · 80% acc · ${injectOddsPct}% recover · ${inject.attemptsLeft}/${inject.attemptsMax} left`
                 : overachiever ? 'quota cleared · extra intake · future forecast grows'
                 : '';

  const cipherLabel = useCipherText(isInject ? label : '');

  const cls = `kb-inject-slot`
    + (locked       ? ' is-locked'       : '')
    + (isInject     ? ' is-inject'       : '')
    + (overachiever ? ' is-overachiever' : '');

  if (locked) {
    return (
      <div
        className={cls}
        data-screen-label="inject-slot-locked"
        aria-disabled="true"
        title="finish today's daily run to unlock"
      >
        <div className="kb-inject-lock" aria-hidden>
          <svg className="kb-inject-lock-pad" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="10.5" width="14" height="9.5" rx="1.2" />
            <path d="M8 10.5 V8 a4 4 0 0 1 8 0 v2.5" />
          </svg>
          <span className="kb-inject-lock-text">REQUIRES DAILY</span>
        </div>
      </div>
    );
  }

  const handleClick = isInject ? onInject : onRun;
  const screenLabel = isInject ? 'inject-slot-inject' : 'inject-slot-overclock';

  return (
    <button
      className={cls}
      onClick={handleClick}
      data-screen-label={screenLabel}
      data-overachiever={overachiever ? 'true' : undefined}
      data-inject={isInject ? 'true' : undefined}
    >
      {isInject && (
        <>
          <span className="kb-rp-skull" aria-hidden>☠</span>
          <span className="kb-rp-corner inj tl" aria-hidden>◤</span>
          <span className="kb-rp-corner inj tr" aria-hidden>◥</span>
          <span className="kb-rp-corner inj bl" aria-hidden>◣</span>
          <span className="kb-rp-corner inj br" aria-hidden>◢</span>
        </>
      )}
      <div className="kb-rp-body">
        <div className="kb-rp-top">{topLabel}</div>
        <div className="kb-rp-label" data-text={label}>
          {isInject ? cipherLabel : label}
        </div>
        <div className="kb-rp-sub">{subCopy}</div>
      </div>
      <div className="kb-rp-arrow">▸</div>
    </button>
  );
};

// Order cards so the HOT pick is first; everyone else keeps their relative order.
const orderForHot = (list, hotId) => {
  if (!hotId) return list;
  const hot = list.find(c => c.id === hotId);
  if (!hot) return list;
  return [hot, ...list.filter(c => c.id !== hotId)];
};

const ChallengeGrid = ({ onPick, hotId, dailyDone, hotTier }) => {
  const ordered = orderForHot(CHALLENGES, hotId);
  // hotTier is 'gold' (first run today) | 'silver' (already claimed) | null.
  // Falls back to gold so the tile renders sensibly if Home didn't pass one.
  const tier = hotTier || 'gold';
  const HOT_GOLD   = (window.Daily && window.Daily.HOT_GOLD)   || 3;
  const HOT_SILVER = (window.Daily && window.Daily.HOT_SILVER) || 1.5;
  const tierMult = tier === 'silver' ? HOT_SILVER : HOT_GOLD;
  // Format silver multiplier as "1.5×" (no trailing zero) but still print
  // gold as a clean integer.
  const tierMultLabel = Number.isInteger(tierMult) ? `${tierMult}` : tierMult.toFixed(1);
  return (
    <div
      className={`kb-chal-grid${dailyDone ? ' is-done' : ''}`}
      data-screen-label="challenge-grid"
    >
      {ordered.map(c => {
        const isHot = c.id === hotId;
        const xp = isHot ? Math.round(c.xp * tierMult) : c.xp;
        const hotCls = isHot ? ` is-hot is-${tier}` : '';
        return (
          <button key={c.id} className={`kb-chal${hotCls}`} onClick={() => onPick && onPick(c.id)}>
            <div className="kb-chal-glyph">{c.glyph}</div>
            <div className="kb-chal-meta">
              <div className="kb-chal-name">{c.name}</div>
              <div className="kb-chal-sub">{c.sub}</div>
            </div>
            <div className="kb-chal-ascii">{c.ascii}</div>
            <span className={`kb-chal-xp${isHot ? ` is-hot is-${tier}` : ''}`}>
              +{xp} XP{isHot ? ` · ${tierMultLabel}×` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
};

Object.assign(window, { InjectSlot, ChallengeGrid, CHALLENGES });
