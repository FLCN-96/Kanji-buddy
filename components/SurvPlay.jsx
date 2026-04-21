// Survival — in-play (TRACE redesign)

// Biometric link: an EKG sweep replaces the heart glyph. The trace draws a
// QRS-shaped path; --beat (set inline) controls the pulse rate so depth still
// reads as "your pulse is climbing". On death the wave amplifies once, jitters,
// then flatlines.
const EKG_PATH = 'M0 12 L18 12 L22 12 L26 4 L30 20 L34 8 L38 12 L60 12 L64 12 L68 6 L72 18 L76 12 L120 12';

const SVEKG = ({ broken, pressure }) => {
  const beat = Math.max(0.36, 1.1 - pressure * 0.74); // seconds per beat
  const stage = broken ? 'is-flatline' : 'is-live';
  const tone = pressure < 0.4 ? 'is-cool' : pressure < 0.8 ? 'is-warm' : 'is-hot';
  return (
    <div className={`sv-ekg ${stage} ${tone}`} style={{'--beat': `${beat}s`}}>
      <svg className="sv-ekg-svg" viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden>
        <line className="sv-ekg-base" x1="0" y1="12" x2="120" y2="12" />
        <path className="sv-ekg-trace" d={EKG_PATH} />
        {broken && <line className="sv-ekg-flat" x1="0" y1="12" x2="120" y2="12" />}
      </svg>
      <div className="sv-ekg-meta">
        <span className="sv-ekg-lbl">BIO</span>
        <span className="sv-ekg-bpm">{broken ? '---' : Math.round(60 / beat)}<i>bpm</i></span>
      </div>
    </div>
  );
};

// Layer indicator (replaces the depth column). Two-line stack: LAYER label,
// padded mono number, optional /max sub. JLPT chip lives below as a separate
// pill so the digit owns its own line and tears in cleanly on each tick.
const SVLayer = ({ depth, jlpt }) => (
  <div className="sv-layer">
    <div className="sv-layer-lbl">LAYER</div>
    <div className="sv-layer-row">
      <span className="sv-layer-val" key={depth}>L-{String(depth).padStart(3, '0')}</span>
    </div>
    <div className="sv-layer-jlpt">JLPT N{jlpt}</div>
  </div>
);

// Hex packet ID derived from card.idx — 4 stable hex chars. Used as a "subject
// under analysis" identifier in the prompt frame.
const packetId = (idx) => '0x' + ((idx | 0) + 0x4f00).toString(16).toUpperCase().padStart(4, '0');

// Entropy bar — JLPT difficulty rendered as 5 unicode blocks. N5 → 1 fill, N1 → 5.
const entropy = (jlpt) => {
  const fills = Math.max(1, 6 - jlpt);
  return '▮'.repeat(fills) + '▯'.repeat(5 - fills);
};

const SVPromptFrame = ({ jlpt, idx, kindLabel, eyes, children }) => (
  <div className={`sv-prompt sv-frame${eyes >= 3 ? ' is-watched' : ''}`}>
    <div className="sv-frame-meta">
      <span className="sv-frame-id">SUBJECT {idx} · N{jlpt}</span>
      <span className="sv-frame-status">ANALYZING ▸</span>
    </div>
    <div className="sv-frame-body">
      <span className="sv-corner sv-corner-tl" aria-hidden />
      <span className="sv-corner sv-corner-tr" aria-hidden />
      <span className="sv-corner sv-corner-bl" aria-hidden />
      <span className="sv-corner sv-corner-br" aria-hidden />
      {children}
    </div>
    <div className="sv-frame-foot">
      <span className="sv-frame-mode">{kindLabel}</span>
      <span className="sv-frame-entropy">ENTROPY {entropy(jlpt)}</span>
    </div>
  </div>
);

const SVPrompt = ({ prompt, jlpt, isUnseen, eyes, idHex }) => {
  if (prompt.kind === 'kanji') {
    return (
      <SVPromptFrame jlpt={jlpt} idx={idHex} kindLabel="PROMPT.MEANING" eyes={eyes}>
        <div className={`sv-prompt-glyph${isUnseen ? ' is-unseen' : ''}`}>
          <span>{prompt.kanji}</span>
        </div>
      </SVPromptFrame>
    );
  }
  if (prompt.kind === 'read') {
    return (
      <SVPromptFrame jlpt={jlpt} idx={idHex} kindLabel="PROMPT.READING" eyes={eyes}>
        <div className="sv-prompt-reading">{prompt.reading}</div>
      </SVPromptFrame>
    );
  }
  // mean2k
  return (
    <SVPromptFrame jlpt={jlpt} idx={idHex} kindLabel="PROMPT.SEMANTIC" eyes={eyes}>
      <div className="sv-prompt-mean-word">{prompt.mean}</div>
      {prompt.reading && <div className="sv-prompt-mean-hint">{prompt.reading.replace(/\./g, '')}</div>}
    </SVPromptFrame>
  );
};

// Tile — decryption console row. Kanji glyph (when shown) stays sacred:
// no jitter, no chromatic split. The frame chrome (corners, key badge, border)
// is what reacts to state. RGB-split on wrong fires on the tile *text* only
// in the Latin-mono case; kanji tiles get a border+badge wrong state without
// touching the glyph.
const SVTile = ({ index, label, isKanji, state, onPick }) => {
  const stateCls = state ? ` is-${state}` : '';
  return (
    <button
      className={`sv-tile${isKanji ? ' is-kanji' : ''}${stateCls}`}
      onClick={() => onPick(index)}
      disabled={!!state}
    >
      <span className="sv-corner sv-corner-tl" aria-hidden />
      <span className="sv-corner sv-corner-tr" aria-hidden />
      <span className="sv-corner sv-corner-bl" aria-hidden />
      <span className="sv-corner sv-corner-br" aria-hidden />
      <span className="sv-tile-key">[{index + 1}]</span>
      <span className="sv-tile-text">{label}</span>
      <span className="sv-tile-addr" aria-hidden>0x0{index + 1}</span>
    </button>
  );
};

const SVPlay = ({ q, depth, jlpt, onPick, feedback, heartBreak, pressure, band, eyes, sectorFlash, isUnseen }) => {
  const bigTile = q.prompt.kind !== 'kanji';
  // Pristine: suppress :hover glow for the first paint after a pick — the
  // pointer often sits over a freshly-mounted tile and would inherit the prior
  // selection's hover state.
  const [pristine, setPristine] = React.useState(true);
  React.useEffect(() => {
    setPristine(true);
    const onMove = () => setPristine(false);
    window.addEventListener('pointermove', onMove, { once: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [q.card.idx]);

  const idHex = packetId(q.card.idx);
  return (
    <div className="sv-play" data-screen-label="sv-play" data-band={band}>
      <div className="sv-play-top">
        <SVEKG broken={heartBreak} pressure={pressure} />
        <SVLayer depth={depth} jlpt={jlpt} />
      </div>

      {/* Intrusion marquee — appears at band 2+ (depth 25+). Sells "you've
          been spotted" without crowding the prompt. */}
      {band >= 2 && (
        <div className="sv-marquee" aria-hidden>
          <span>▸ INTRUSION DETECTED // ROUTING COUNTERMEASURES // TRACE CONVERGING // </span>
          <span>▸ INTRUSION DETECTED // ROUTING COUNTERMEASURES // TRACE CONVERGING // </span>
        </div>
      )}

      <SVPrompt
        prompt={q.prompt}
        jlpt={jlpt}
        isUnseen={isUnseen}
        eyes={eyes}
        idHex={idHex}
      />

      <div
        key={q.card.idx}
        className={`sv-tiles${bigTile ? ' is-big' : ''}${pristine ? ' is-pristine' : ''}`}
      >
        {q.tiles.map((t, i) => {
          let state = '';
          if (feedback) {
            if (i === feedback.correct) state = 'correct';
            else if (i === feedback.picked) state = 'wrong';
            else state = 'dim';
          }
          return (
            <SVTile key={i + t} index={i} label={t} isKanji={bigTile} state={state} onPick={onPick} />
          );
        })}
      </div>

      {/* EYES indicator — phone-friendly hesitation tracker. Only renders once
          the system has flagged at least one tick. Caps at 5 visually. */}
      {eyes > 0 && (
        <div className={`sv-eyes${eyes >= 3 ? ' is-watching' : ''}`} aria-hidden>
          <span className="sv-eyes-lbl">EYES</span>
          <span className="sv-eyes-val">{Math.min(eyes, 5)}</span>
          <span className="sv-eyes-bar">
            {Array.from({ length: 5 }).map((_, i) => (
              <i key={i} className={i < eyes ? 'on' : ''} />
            ))}
          </span>
        </div>
      )}

      {sectorFlash && (
        <div key={sectorFlash.t} className="sv-breach">
          <div className="sv-breach-bar" />
          <div className="sv-breach-text">
            <div className="sv-breach-k">▸ LAYER {String(sectorFlash.depth).padStart(3, '0')} BREACHED</div>
            <div className="sv-breach-v">SECTOR {sectorFlash.sector} CLEAR</div>
            <div className="sv-breach-d">
              {sectorFlash.escalated ? `▼ FIREWALL → JLPT N${sectorFlash.jlpt}` : '+20 xp · descend'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { SVEKG, SVLayer, SVPrompt, SVPromptFrame, SVTile, SVPlay, packetId });

