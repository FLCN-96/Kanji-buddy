// Mode selection: primary RUN + challenge grid
// CHALLENGES carry an average XP hint shown on the tile. Actual per-session
// XP is performance-based and computed inside each mode's orchestrator.
// A "HOT" pick is chosen per day and triples that mode's XP; HOT floats up.

const CHALLENGES = [
  { id: 'time',     glyph: '秒', name: 'TIME ATTACK',   sub: '60s · max cards',           ascii: '■■■■□□□□ 60s', xp: 150 },
  { id: 'survival', glyph: '命', name: 'SURVIVAL',      sub: '1 miss · run ends',         ascii: '♥ ♥ ♥ → ╳',   xp: 120 },
  { id: 'streak',   glyph: '忘', name: 'STREAK GUARD',  sub: '12 cards about to leak',    ascii: '▮▮▮▮▯▯ 12',    xp: 90  },
  { id: 'leech',    glyph: '蛭', name: 'LEECH HUNT',    sub: '8 worst · target & purge',  ascii: '☠ × 8',        xp: 100 },
  { id: 'match',    glyph: '合', name: 'MATCH',         sub: '60s · pair kanji ↔ meaning', ascii: '[字]→[char]',  xp: 90  },
];

const HOT_MULTIPLIER = 3;

const RunPrimary = ({ state, deck, onRun }) => {
  const loading      = state === 'loading';
  const clear        = state === 'clear';
  const overachiever = clear;
  const disabled     = loading;
  const count        = deck?.total ?? 0;
  const mins         = count > 0 ? Math.max(1, Math.ceil(count * 9 / 60)) : 0;

  const topLabel = loading      ? '▸ syncing deck…'
                 : overachiever ? '▸ past the limiter'
                 : '▸ resume daily run';
  const label    = loading      ? 'RUN'
                 : overachiever ? 'OVERCLOCK'
                 : 'RUN';
  const subCopy  = loading      ? 'loading…'
                 : overachiever ? 'bonus cycle · cooling compromised'
                 : `${count} cards · ~${mins}m · srs priority`;

  const cls = `kb-run-primary`
    + (disabled     ? ' is-disabled'     : '')
    + (overachiever ? ' is-overachiever' : '');

  return (
    <button
      className={cls}
      onClick={disabled ? undefined : onRun}
      data-screen-label={overachiever ? 'run-primary-overclock' : 'run-primary'}
      data-overachiever={overachiever ? 'true' : undefined}
    >
      <div>
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

const ChallengeGrid = ({ onPick, hotId, dailyDone }) => {
  const ordered = orderForHot(CHALLENGES, hotId);
  return (
    <div
      className={`kb-chal-grid${dailyDone ? ' is-done' : ''}`}
      data-screen-label="challenge-grid"
    >
      {ordered.map(c => {
        const isHot = c.id === hotId;
        const xp = isHot ? c.xp * HOT_MULTIPLIER : c.xp;
        return (
          <button key={c.id} className={`kb-chal${isHot ? ' is-hot' : ''}`} onClick={() => onPick && onPick(c.id)}>
            <div className="kb-chal-glyph">{c.glyph}</div>
            <div className="kb-chal-meta">
              <div className="kb-chal-name">{c.name}</div>
              <div className="kb-chal-sub">{c.sub}</div>
            </div>
            <div className="kb-chal-ascii">{c.ascii}</div>
            <span className={`kb-chal-xp${isHot ? ' is-hot' : ''}`}>
              +{xp} XP{isHot ? ` · ${HOT_MULTIPLIER}×` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
};

Object.assign(window, { RunPrimary, ChallengeGrid, CHALLENGES, HOT_MULTIPLIER });
