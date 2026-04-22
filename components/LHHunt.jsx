// LeechHunt — active hunt view (3-stage cleanse)

const LHStageBar = ({ stageIdx, firstTry }) => (
  <div className="lh-stagebar">
    {[0,1,2].map(i => (
      <div key={i} className={`lh-stagebar-seg ${i < stageIdx ? 'is-done' : i === stageIdx ? 'is-current' : ''}${!firstTry && i < stageIdx ? ' is-dirty' : ''}`}>
        <span className="lh-stagebar-n">{String(i+1).padStart(2,'0')}</span>
        <span className="lh-stagebar-t">
          {i === 0 ? 'MARK' : i === 1 ? 'VOICE' : 'FIELD USE'}
        </span>
      </div>
    ))}
  </div>
);

// Briefly scrambles the kanji on lock-on, then snaps to the real glyph.
// Uses window.useScramble (attached by LHScreens.jsx).
const LHLockGlyph = ({ k, isUnseen }) => {
  const [locked, setLocked] = React.useState(false);
  React.useEffect(() => {
    setLocked(false);
    const t = setTimeout(() => setLocked(true), 360);
    return () => clearTimeout(t);
  }, [k]);
  const scram = window.useScramble ? window.useScramble(k.charCodeAt(0), 1) : k;
  const cls = `lh-hunt-target-k${isUnseen ? ' is-unseen-glyph' : ''}${locked ? '' : ' is-scrambling'}`;
  return <span className={cls}>{locked ? k : scram}</span>;
};

const TIER_LETTERS = { 5: 'D', 4: 'C', 3: 'B', 2: 'A', 1: 'S' };

const LHHunt = ({ leech, stage, stageIdx, onPick, feedback, isUnseen }) => {
  const card = leech.card;
  const ask = stage.kind === 'recognition' ? '▸ IDENTIFY // MARK'
    : stage.kind === 'reading' ? '▸ DECODE // VOICE'
    : '▸ PROVE // FIELD USE';
  const tier = TIER_LETTERS[card.jlpt] || 'D';
  const lapses = leech.lapses || 0;
  const bleedCls = lapses >= 3 ? 'lh-hunt-target-cont' : lapses >= 1 ? 'lh-hunt-target-jlpt' : 'lh-hunt-target-eyebrow';

  return (
    <div className="lh-hunt" data-screen-label={`lh-hunt-${stage.kind}`}>
      <div className={`lh-hunt-target${isUnseen ? ' is-unseen-frame' : ''}`}>
        <div className="lh-hunt-target-meta">
          <span className="lh-hunt-target-eyebrow">▸ {isUnseen ? 'UNSEEN GLYPH' : 'MARK LOCKED'}</span>
          <span className="lh-hunt-target-jlpt">N{card.jlpt} // THREAT {tier}</span>
          <span className={bleedCls} style={lapses === 0 ? {color: 'var(--fg-2)', fontWeight: 400} : null}>BLEEDS · {lapses}</span>
        </div>
        <div className="lh-hunt-target-body">
          <div className="lh-hunt-target-reticle" aria-hidden>
            <span className="lh-retic lh-retic-tl" />
            <span className="lh-retic lh-retic-tr" />
            <span className="lh-retic lh-retic-bl" />
            <span className="lh-retic lh-retic-br" />
            <LHLockGlyph k={card.k} isUnseen={isUnseen} />
          </div>
        </div>
      </div>

      <LHStageBar stageIdx={stageIdx} firstTry={leech.firstTry} />

      <div className="lh-hunt-ask">{ask}</div>

      {stage.kind === 'application' && (
        <div className="lh-hunt-ctx">
          <span className="lh-hunt-ctx-lbl">SAMPLE TEXT //</span>
          <span className="lh-hunt-ctx-val">{stage.blanked}</span>
        </div>
      )}

      <div className={`lh-hunt-tiles lh-hunt-tiles-${stage.kind}`}>
        {stage.tiles.map((t, i) => {
          let state = '';
          if (feedback) {
            if (i === feedback.correct) state = ' is-correct';
            else if (i === feedback.picked) state = ' is-wrong';
            else state = ' is-dim';
          }
          const label = stage.kind === 'application' ? t.show : t;
          return (
            <button key={i} className={`lh-tile${state}`} onClick={() => onPick(i)} disabled={!!feedback}>
              <span className="lh-tile-key">{i+1}</span>
              <span className={`lh-tile-text ${stage.kind === 'reading' ? 'is-jp' : ''}`}>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="lh-hunt-foot">
        STAGE {String(stageIdx+1).padStart(2,'0')} / 03 // BLEED = SCRAMBLE // 3 BLEEDS = VOID
      </div>
    </div>
  );
};

Object.assign(window, { LHHunt, LHStageBar, LHLockGlyph });
