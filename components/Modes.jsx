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

const RunPrimary = ({ state, deck, onRun }) => {
  const loading      = state === 'loading';
  const clear        = state === 'clear';
  const overachiever = clear;
  const disabled     = loading;
  const count        = deck?.total ?? 0;
  const mins         = count > 0 ? Math.max(1, Math.ceil(count * 9 / 60)) : 0;

  const topLabel = loading      ? '▸ syncing deck…'
                 : overachiever ? '▸ EXTRA CYCLE? · entirely optional'
                 : '▸ resume daily run';
  const label    = loading      ? 'RUN'
                 : overachiever ? 'OVERCLOCK'
                 : 'RUN';
  const subCopy  = loading      ? 'loading…'
                 : overachiever ? 'quota cleared · extra intake · future forecast grows'
                 : `${count} ${count === 1 ? 'card' : 'cards'} · ~${mins}m · srs priority`;

  const cls = `kb-run-primary`
    + (disabled     ? ' is-disabled'     : '')
    + (overachiever ? ' is-overachiever' : '');

  // Cornered HUD brackets only on the regular daily CTA — they'd clash with
  // the overclock tile's chaotic radial-gradient halo.
  const showCorners = !disabled && !overachiever;

  return (
    <button
      className={cls}
      onClick={disabled ? undefined : onRun}
      data-screen-label={overachiever ? 'run-primary-overclock' : 'run-primary'}
      data-overachiever={overachiever ? 'true' : undefined}
    >
      {showCorners && (
        <>
          <span className="kb-rp-corner tl" aria-hidden>◤</span>
          <span className="kb-rp-corner tr" aria-hidden>◥</span>
          <span className="kb-rp-corner bl" aria-hidden>◣</span>
          <span className="kb-rp-corner br" aria-hidden>◢</span>
        </>
      )}
      <div className="kb-rp-body">
        <div className="kb-rp-top">{topLabel}</div>
        <div className="kb-rp-label" data-text={label}>{label}</div>
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
