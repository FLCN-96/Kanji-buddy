// LeechHunt — active hunt view (3-stage cleanse)

const LHStageBar = ({ stageIdx, firstTry }) => (
  <div className="lh-stagebar">
    {[0,1,2].map(i => (
      <div key={i} className={`lh-stagebar-seg ${i < stageIdx ? 'is-done' : i === stageIdx ? 'is-current' : ''}${!firstTry && i < stageIdx ? ' is-dirty' : ''}`}>
        <span className="lh-stagebar-n">{String(i+1).padStart(2,'0')}</span>
        <span className="lh-stagebar-t">
          {i === 0 ? 'RECOGNITION' : i === 1 ? 'READING' : 'APPLICATION'}
        </span>
      </div>
    ))}
  </div>
);

const LHHunt = ({ leech, stage, stageIdx, onPick, feedback }) => {
  const card = leech.card;
  const ask = stage.kind === 'recognition' ? 'pick the meaning'
    : stage.kind === 'reading' ? 'pick the reading'
    : 'pick the correct usage';

  return (
    <div className="lh-hunt" data-screen-label={`lh-hunt-${stage.kind}`}>
      <div className="lh-hunt-target">
        <div className="lh-hunt-target-meta">
          <span className="lh-hunt-target-eyebrow">▸ TARGET ACQUIRED</span>
          <span className="lh-hunt-target-jlpt">N{card.jlpt}</span>
          <span className="lh-hunt-target-cont">{Math.round(leech.contamination*100)}% contam</span>
        </div>
        <div className="lh-hunt-target-body">
          <div className="lh-hunt-target-reticle" aria-hidden>
            <span className="lh-retic lh-retic-tl" />
            <span className="lh-retic lh-retic-tr" />
            <span className="lh-retic lh-retic-bl" />
            <span className="lh-retic lh-retic-br" />
            <span className="lh-hunt-target-k">{card.k}</span>
          </div>
        </div>
      </div>

      <LHStageBar stageIdx={stageIdx} firstTry={leech.firstTry} />

      <div className="lh-hunt-ask">{ask}</div>

      {stage.kind === 'application' && (
        <div className="lh-hunt-ctx">
          <span className="lh-hunt-ctx-lbl">example contains:</span>
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
        stage {stageIdx+1}/3 · miss any = weakened (card survives)
      </div>
    </div>
  );
};

Object.assign(window, { LHHunt, LHStageBar });
