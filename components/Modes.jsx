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

const RunPrimary = ({ state, deck, onRun, inject, onInject }) => {
  const loading      = state === 'loading';
  const clear        = state === 'clear';
  // Daily run ALWAYS wins the slot when there's still daily work — INJECT
  // only surfaces post-clear (the OVERCLOCK position) so the user can't
  // accidentally trade today's required session for an optional gamble.
  const isInject     = !!inject && clear;
  const overachiever = clear && !isInject;
  const disabled     = loading;
  const count        = deck?.total ?? 0;
  const mins         = count > 0 ? Math.max(1, Math.ceil(count * 9 / 60)) : 0;

  // INJECT-tile copy is built from the live snapshot so the user can read
  // the chain at risk + their odds + remaining attempts before tapping.
  const injectOddsPct = isInject ? Math.round((inject.odds || 0) * 100) : 0;

  const topLabel = loading      ? '▸ syncing deck…'
                 : isInject     ? '▸ STREAK.RECOVER() // chain corrupted'
                 : overachiever ? '▸ EXTRA CYCLE? · entirely optional'
                 : '▸ resume daily run';
  const label    = loading      ? 'RUN'
                 : isInject     ? 'STREAK INJECT'
                 : overachiever ? 'OVERCLOCK'
                 : 'RUN';
  const subCopy  = loading      ? 'loading…'
                 : isInject     ? `chain @ ${inject.lostStreak}d · 80% acc · ${injectOddsPct}% recover · ${inject.attemptsLeft}/${inject.attemptsMax} left`
                 : overachiever ? 'quota cleared · extra intake · future forecast grows'
                 : `${count} ${count === 1 ? 'card' : 'cards'} · ~${mins}m · srs priority`;

  const cipherLabel = useCipherText(isInject ? label : '');

  const cls = `kb-run-primary`
    + (disabled     ? ' is-disabled'     : '')
    + (isInject     ? ' is-inject'       : '')
    + (overachiever ? ' is-overachiever' : '');

  // Cornered HUD brackets only on the regular daily CTA — they'd clash with
  // the overclock halo and the inject tile's corrupt frame.
  const showCorners = !disabled && !overachiever && !isInject;

  const handleClick = disabled ? undefined : (isInject ? onInject : onRun);
  const screenLabel = isInject ? 'run-primary-inject' : (overachiever ? 'run-primary-overclock' : 'run-primary');

  return (
    <button
      className={cls}
      onClick={handleClick}
      data-screen-label={screenLabel}
      data-overachiever={overachiever ? 'true' : undefined}
      data-inject={isInject ? 'true' : undefined}
    >
      {showCorners && (
        <>
          <span className="kb-rp-corner tl" aria-hidden>◤</span>
          <span className="kb-rp-corner tr" aria-hidden>◥</span>
          <span className="kb-rp-corner bl" aria-hidden>◣</span>
          <span className="kb-rp-corner br" aria-hidden>◢</span>
        </>
      )}
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

Object.assign(window, { RunPrimary, ChallengeGrid, CHALLENGES });
