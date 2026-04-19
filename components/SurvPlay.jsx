// Survival — in-play

const SVHeart = ({ broken, pressure }) => {
  const beat = Math.max(0.4, 1.1 - pressure * 0.6); // faster as pressure rises, seconds
  return (
    <div className={`sv-heart${broken ? ' is-broken' : ''}`} style={{'--beat': `${beat}s`}}>
      <span className="sv-heart-glyph">♥</span>
      <span className="sv-heart-ring" aria-hidden />
    </div>
  );
};

const SVPrompt = ({ prompt, jlpt }) => {
  if (prompt.kind === 'kanji') {
    return (
      <div className="sv-prompt sv-prompt-kanji">
        <div className="sv-prompt-card-meta">
          <span>JLPT N{jlpt}</span>
          <span className="sv-prompt-ask">meaning?</span>
        </div>
        <div className="sv-prompt-glyph">
          <span>{prompt.kanji}</span>
          <span className="sv-prompt-glyph-ghost" aria-hidden>{prompt.kanji}</span>
        </div>
      </div>
    );
  }
  if (prompt.kind === 'read') {
    return (
      <div className="sv-prompt sv-prompt-read">
        <div className="sv-prompt-card-meta">
          <span>JLPT N{jlpt}</span>
          <span className="sv-prompt-ask">which kanji?</span>
        </div>
        <div className="sv-prompt-reading">{prompt.reading}</div>
        <div className="sv-prompt-sub">reading only</div>
      </div>
    );
  }
  // mean2k
  return (
    <div className="sv-prompt sv-prompt-mean">
      <div className="sv-prompt-card-meta">
        <span>JLPT N{jlpt}</span>
        <span className="sv-prompt-ask">which kanji?</span>
      </div>
      <div className="sv-prompt-mean-word">{prompt.mean}</div>
      {prompt.reading && <div className="sv-prompt-mean-hint">{prompt.reading.replace(/\./g,'')}</div>}
    </div>
  );
};

const SVPlay = ({ q, depth, jlpt, onPick, feedback, heartBreak, pressure, sectorFlash }) => {
  const bigTile = q.prompt.kind !== 'kanji'; // tiles show kanji — make them big
  return (
    <div className="sv-play" data-screen-label="sv-play">
      <div className="sv-play-top">
        <SVHeart broken={heartBreak} pressure={pressure} />
        <div className="sv-depth-col">
          <div className="sv-depth-col-lbl">DEPTH</div>
          <div className="sv-depth-col-val" key={depth}>{String(depth).padStart(3,'0')}</div>
          <div className="sv-depth-col-jlpt">N{jlpt}</div>
        </div>
      </div>

      <SVPrompt prompt={q.prompt} jlpt={jlpt} />

      <div className={`sv-tiles${bigTile ? ' is-big' : ''}`}>
        {q.tiles.map((t, i) => {
          let state = '';
          if (feedback) {
            if (i === feedback.correct) state = ' is-correct';
            else if (i === feedback.picked) state = ' is-wrong';
            else state = ' is-dim';
          }
          return (
            <button key={i + t} className={`sv-tile${state}${bigTile ? ' is-kanji' : ''}`}
              onClick={() => onPick(i)} disabled={!!feedback}>
              <span className="sv-tile-key">{i+1}</span>
              <span className="sv-tile-text">{t}</span>
            </button>
          );
        })}
      </div>

      {sectorFlash && (
        <div key={sectorFlash.t} className="sv-sector-flash">
          <div className="sv-sector-k">SECTOR {Math.floor(sectorFlash.depth / 10)}</div>
          <div className="sv-sector-v">CLEARED</div>
          <div className="sv-sector-d">depth {sectorFlash.depth} · +20 xp</div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { SVPlay, SVHeart, SVPrompt });
