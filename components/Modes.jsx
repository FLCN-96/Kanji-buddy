// Mode selection: primary RUN + challenge grid
// CHALLENGES carry base XP rewards. A "HOT" pick is chosen per day by the
// caller and triples that mode's XP; the HOT card floats to the top.

const CHALLENGES = [
  {
    id: 'time',
    glyph: '秒',
    name: 'TIME ATTACK',
    sub: '60s · max cards',
    tag: null,
    tagClass: null,
    ascii: '■■■■□□□□ 60s',
    xp: 60,
  },
  {
    id: 'survival',
    glyph: '命',
    name: 'SURVIVAL',
    sub: '1 miss · run ends',
    tag: null,
    ascii: '♥ ♥ ♥ → ╳',
    xp: 80,
  },
  {
    id: 'streak',
    glyph: '忘',
    name: 'STREAK GUARD',
    sub: '12 cards about to leak',
    tag: 'DUE',
    tagClass: 'dbl',
    ascii: '▮▮▮▮▯▯ 12',
    xp: 50,
  },
  {
    id: 'leech',
    glyph: '蛭',
    name: 'LEECH HUNT',
    sub: '8 worst · target & purge',
    tag: null,
    ascii: '☠ × 8',
    xp: 70,
  },
  {
    id: 'match',
    glyph: '合',
    name: 'MATCH',
    sub: '60s · pair kanji ↔ meaning',
    tag: 'NEW',
    tagClass: 'new',
    ascii: '[字]→[char]',
    xp: 55,
  },
];

const HOT_MULTIPLIER = 3;

const RunPrimary = ({ state, onRun }) => {
  const disabled = state === 'clear';
  const count = state === 'behind' ? 180 : 42;
  return (
    <button
      className={`kb-run-primary${disabled ? ' is-disabled' : ''}`}
      onClick={disabled ? undefined : onRun}
      data-screen-label="run-primary"
    >
      <div>
        <div className="kb-rp-top">{disabled ? '▸ queue clear' : state === 'behind' ? '▸ resume · srs debt' : '▸ resume daily run'}</div>
        <div className="kb-rp-label">{disabled ? 'ALL CLEAR' : 'RUN'}</div>
        <div className="kb-rp-sub">
          {disabled
            ? 'next drop in 7h · optional practice only'
            : `${count} cards · ~${Math.ceil(count * 9 / 60)}m · srs priority`}
        </div>
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

const ChallengeGrid = ({ onPick, hotId }) => {
  const ordered = orderForHot(CHALLENGES, hotId);
  return (
    <div className="kb-chal-grid" data-screen-label="challenge-grid">
      {ordered.map(c => {
        const isHot = c.id === hotId;
        const xp = isHot ? c.xp * HOT_MULTIPLIER : c.xp;
        const tag = isHot ? 'HOT' : c.tag;
        const tagClass = isHot ? 'hot' : (c.tagClass || '');
        return (
          <button key={c.id} className="kb-chal" onClick={() => onPick && onPick(c.id)}>
            {tag && <span className={`kb-chal-tag ${tagClass}`}>{tag}</span>}
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
