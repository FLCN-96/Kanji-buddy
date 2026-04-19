// Mode selection: primary RUN + challenge grid

const CHALLENGES = [
  {
    id: 'time',
    glyph: '秒',
    name: 'TIME ATTACK',
    sub: '60s · max cards',
    tag: 'HOT',
    tagClass: 'hot',
    ascii: '■■■■□□□□ 60s',
  },
  {
    id: 'survival',
    glyph: '命',
    name: 'SURVIVAL',
    sub: '1 miss · run ends',
    tag: null,
    ascii: '♥ ♥ ♥ → ╳',
  },
  {
    id: 'streak',
    glyph: '忘',
    name: 'STREAK GUARD',
    sub: '12 cards about to leak',
    tag: 'DUE',
    tagClass: 'dbl',
    ascii: '▮▮▮▮▯▯ 12',
  },
  {
    id: 'leech',
    glyph: '蛭',
    name: 'LEECH HUNT',
    sub: '8 worst · target & purge',
    tag: null,
    ascii: '☠ × 8',
  },
  {
    id: 'radical',
    glyph: '部',
    name: 'RADICAL DRILL',
    sub: 'components only',
    tag: 'NEW',
    tagClass: 'new',
    ascii: '亻 + 言 = 信',
  },
  {
    id: 'match',
    glyph: '合',
    name: 'MATCH',
    sub: 'pair kanji ↔ meaning',
    tag: null,
    ascii: '[字]=[char]',
  },
];

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

const ChallengeGrid = ({ onPick }) => (
  <div className="kb-chal-grid" data-screen-label="challenge-grid">
    {CHALLENGES.map(c => (
      <button key={c.id} className="kb-chal" onClick={() => onPick && onPick(c.id)}>
        {c.tag && <span className={`kb-chal-tag ${c.tagClass || ''}`}>{c.tag}</span>}
        <div className="kb-chal-glyph">{c.glyph}</div>
        <div className="kb-chal-name">{c.name}</div>
        <div className="kb-chal-sub">{c.sub}</div>
        <div className="kb-chal-ascii">{c.ascii}</div>
      </button>
    ))}
  </div>
);

Object.assign(window, { RunPrimary, ChallengeGrid, CHALLENGES });
