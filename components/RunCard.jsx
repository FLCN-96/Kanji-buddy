// Daily Run: card + verdict + flow

const VERDICTS = [
  { id: 'miss', key: '1', label: 'MISS', int: 'again <1m', cls: 'miss' },
  { id: 'hard', key: '2', label: 'HARD', int: 'next 6m',   cls: 'hard' },
  { id: 'ok',   key: '3', label: 'OK',   int: 'next 1d',   cls: 'ok' },
  { id: 'easy', key: '4', label: 'EASY', int: 'next 4d',   cls: 'easy' },
];

const CardReadings = ({ card }) => {
  const kun = card.kun || [];
  const on = card.on || [];
  return (
    <div className="run-readings">
      {on.map((r, i) => (
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
  );
};

const CardExamples = ({ card }) => {
  if (!card.ex || !card.ex.length) return null;
  return (
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
  );
};

const Card = ({ card, revealed, onReveal, latency, flash }) => {
  if (!card) return null;
  const clickable = !revealed;
  const handleCardClick = () => { if (clickable) onReveal(); };
  const handleKey = (e) => {
    if (clickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onReveal();
    }
  };
  return (
    <div
      className={`run-card${revealed ? ' revealed' : ' is-tap'}${flash ? ` run-flash ${flash}`:''}`}
      data-screen-label="run-card"
      onClick={handleCardClick}
      onKeyDown={handleKey}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? 'tap to reveal card' : undefined}
    >
      <div className="run-card-strip">
        <span>▸ EXEC · <b>#{String(card.idx).padStart(4,'0')}</b></span>
        <span className="run-card-strip-r">
          <span>JLPT N{card.jlpt}</span>
          <span>{card.cls && card.cls.toLowerCase()}</span>
          <span>{latency}s</span>
        </span>
      </div>
      <div className="run-card-body">
        <div style={{position:'relative'}}>
          <div className="run-kanji-ghost" aria-hidden="true">{card.k}</div>
          <div className="run-kanji">{card.k}</div>
        </div>
        {!revealed && (
          <div className="run-reveal-hint" aria-hidden="true">tap anywhere to reveal ▾</div>
        )}
        <div className="run-k-meta">
          <CardReadings card={card} />
          <div className="run-mean">"{card.mean}"</div>
          <CardExamples card={card} />
        </div>
      </div>
    </div>
  );
};

// Intro card — shown during the learn phase for brand-new kanji.
// Everything is visible from the start; no reveal interaction.
const IntroCard = ({ card, index, total, onNext }) => {
  if (!card) return null;
  return (
    <div className="run-card revealed run-intro" data-screen-label="run-intro">
      <div className="run-card-strip run-intro-strip">
        <span>▸ LEARN · <b>NEW</b></span>
        <span className="run-card-strip-r">
          <span>{index + 1} / {total}</span>
          <span>JLPT N{card.jlpt}</span>
          {card.strokes ? <span>{card.strokes} {card.strokes === 1 ? 'stroke' : 'strokes'}</span> : null}
        </span>
      </div>
      <div className="run-card-body">
        <div style={{position:'relative'}}>
          <div className="run-kanji-ghost" aria-hidden="true">{card.k}</div>
          <div className="run-kanji">{card.k}</div>
        </div>
        <div className="run-k-meta" style={{opacity:1, maxHeight:'none'}}>
          <CardReadings card={card} />
          <div className="run-mean">"{card.mean}"</div>
          <CardExamples card={card} />
        </div>
      </div>
      <button className="run-intro-next" onClick={onNext}>
        <span>▸ {index + 1 === total ? 'BEGIN QUIZ' : 'GOT IT'}</span>
        <span className="arrow">▸</span>
      </button>
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

Object.assign(window, { Card, IntroCard, VerdictBar, SegProgress, ComboChip, VERDICTS });
