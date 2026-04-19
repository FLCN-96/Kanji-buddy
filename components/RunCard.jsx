// Daily Run: card + verdict + flow

const VERDICTS = [
  { id: 'miss', key: '1', label: 'MISS', int: 'again <1m', cls: 'miss' },
  { id: 'hard', key: '2', label: 'HARD', int: 'next 6m',   cls: 'hard' },
  { id: 'ok',   key: '3', label: 'OK',   int: 'next 1d',   cls: 'ok' },
  { id: 'easy', key: '4', label: 'EASY', int: 'next 4d',   cls: 'easy' },
];

const Card = ({ card, revealed, onReveal, latency, flash }) => {
  if (!card) return null;
  const mainKun = card.kun.filter(k => k.main);
  const kun = card.kun;
  return (
    <div className={`run-card${revealed ? ' revealed' : ''}${flash ? ` run-flash ${flash}`:''}`} data-screen-label="run-card">
      <div className="run-card-strip">
        <span>▸ EXEC · <b>#{String(card.idx).padStart(4,'0')}</b></span>
        <span className="run-card-strip-r">
          <span>JLPT N{card.jlpt}</span>
          <span>{card.cls.toLowerCase()}</span>
          <span>{latency}s</span>
        </span>
      </div>
      <div className="run-card-body">
        <div style={{position:'relative'}}>
          <div className="run-kanji-ghost" aria-hidden="true">{card.k}</div>
          <div className="run-kanji">{card.k}</div>
        </div>
        {!revealed && (
          <button className="run-reveal" onClick={onReveal}>tap to reveal ▾</button>
        )}
        <div className="run-k-meta">
          <div className="run-readings">
            {card.on.map((r, i) => (
              <div key={'on'+i} className={`run-reading on${r.main ? ' main':''}`}>
                <span className="tag">ON</span>
                <span className="r-text">{r.r}</span>
                {r.gloss && <span className="gloss">· {r.gloss}</span>}
              </div>
            ))}
            {kun.map((r, i) => (
              <div key={'kun'+i} className={`run-reading${r.main ? ' main':''}`}>
                <span className="tag">KUN</span>
                <span className="r-text">{r.r}</span>
                {r.gloss && <span className="gloss">· {r.gloss}</span>}
              </div>
            ))}
          </div>
          <div className="run-mean">"{card.mean}"</div>
          {card.ex.length > 0 && (
            <div className="run-examples">
              <div className="run-examples-head">▸ EXAMPLES</div>
              {card.ex.slice(0, 3).map((e, i) => (
                <div key={i} className="run-ex">
                  <div className="run-ex-word">
                    <span>{e.w}</span>
                    <span className="r">{e.r}</span>
                  </div>
                  <div className="run-ex-m">{e.m}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const VerdictBar = ({ enabled, onVerdict }) => (
  <div className={`run-verdict${enabled ? '' : ' is-hidden'}`}>
    {VERDICTS.map(v => (
      <button
        key={v.id}
        className={`run-vbtn ${v.cls}`}
        disabled={!enabled}
        onClick={() => onVerdict(v.id)}
      >
        <span className="v-key">{v.key}</span>
        <span className="v-label">{v.label}</span>
        <span className="v-int">+{v.int}</span>
      </button>
    ))}
  </div>
);

const SegProgress = ({ results, current, total }) => {
  return (
    <div className="run-seg" aria-label={`progress ${results.length}/${total}`}>
      {Array.from({length: total}).map((_, i) => {
        const r = results[i];
        const cls = r === 'miss' ? 'miss' : r === 'hard' ? 'hard' : r ? 'hit' : '';
        const cur = i === current && !r ? ' is-current' : '';
        return <div key={i} className={`run-seg-s ${cls}${cur}`} />;
      })}
    </div>
  );
};

const ComboChip = ({ combo, pulse }) => {
  if (combo < 2) return null;
  return (
    <div className={`run-combo${pulse ? ' pulse' : ''}`}>
      <span>COMBO</span><b>×{combo}</b>
    </div>
  );
};

Object.assign(window, { Card, VerdictBar, SegProgress, ComboChip, VERDICTS });
