// StreakGuard — grid of 12 cells + active quiz overlay

const SGCell = ({ cell, onPick, index }) => {
  const pct = Math.max(0, Math.min(1, cell.remainMs / cell.totalMs));
  const secondsLeft = Math.max(0, cell.remainMs / 1000);
  const riskClass = cell.status === 'live' && pct < 0.25 ? 'is-critical'
                  : cell.status === 'live' && pct < 0.5 ? 'is-risk'
                  : '';
  return (
    <button
      className={`sg-cell sg-cell-${cell.status} ${riskClass}`}
      onClick={() => onPick(cell.id)}
      disabled={cell.status !== 'live'}
      style={{'--pct': pct, '--throb-delay': `${(index * 0.13) % 2}s`}}
    >
      <span className="sg-cell-idx">{String(index+1).padStart(2,'0')}</span>
      <span className="sg-cell-k">{cell.card.k}</span>
      <span className="sg-cell-jlpt">N{cell.card.jlpt}</span>
      <span className="sg-cell-bar"><span className="sg-cell-bar-fill" /></span>
      <span className="sg-cell-tag">
        {cell.status === 'live' && `${secondsLeft.toFixed(1)}s`}
        {cell.status === 'saved' && '✓ SAVED'}
        {cell.status === 'leaked' && '✗ LEAK'}
        {cell.status === 'active' && '◉ ACTIVE'}
      </span>
    </button>
  );
};

const SGGrid = ({ deck, activeId, onPickCell, live }) => {
  return (
    <div className={`sg-grid-wrap${activeId ? ' is-dim' : ''}`} data-screen-label="sg-grid">
      <div className="sg-grid-head">
        <span>▸ CARDS ON LIFELINE</span>
        <span className="sg-grid-live">{live} still leaking</span>
      </div>
      <div className={`sg-grid sg-grid-${deck.length}`}>
        {deck.map((cell, i) => (
          <SGCell key={cell.id} cell={cell} onPick={onPickCell} index={i} />
        ))}
      </div>
      <div className="sg-grid-foot">
        <span className="sg-foot-hint">tap a cell to answer · other cells keep draining</span>
      </div>
    </div>
  );
};

const SGQuiz = ({ cell, onPick, onCancel, feedback }) => {
  const card = cell.card;
  const pct = Math.max(0, Math.min(1, cell.remainMs / cell.totalMs));
  const secondsLeft = Math.max(0, cell.remainMs / 1000);
  return (
    <div className="sg-quiz-overlay" data-screen-label="sg-quiz">
      <div className="sg-quiz">
        <div className="sg-quiz-head">
          <div className="sg-quiz-head-l">
            <span className="sg-quiz-eyebrow">▸ TRIAGE · PATIENT</span>
            <span className="sg-quiz-jlpt">N{card.jlpt}</span>
          </div>
          <button className="sg-quiz-close" onClick={onCancel} title="back to grid (esc)">╳</button>
        </div>

        <div className="sg-quiz-body">
          <div className="sg-quiz-glyph">
            <span>{card.k}</span>
          </div>
          <div className="sg-quiz-readings">
            {card.on.slice(0,2).map((r,i) => <span key={'o'+i} className="sg-read on">オン {r.r}</span>)}
            {card.kun.slice(0,2).map((r,i) => <span key={'k'+i} className="sg-read kn">クン {r.r}</span>)}
          </div>
          <div className="sg-quiz-ask">pick the meaning</div>
        </div>

        <div className="sg-quiz-tiles">
          {cell.tiles.map((t, i) => {
            let state = '';
            if (feedback) {
              if (i === feedback.correct) state = ' is-correct';
              else if (i === feedback.picked) state = ' is-wrong';
              else state = ' is-dim';
            }
            return (
              <button key={i} className={`sg-tile${state}`} onClick={() => onPick(i)} disabled={!!feedback}>
                <span className="sg-tile-key">{i+1}</span>
                <span className="sg-tile-text">{t}</span>
              </button>
            );
          })}
        </div>

        <div className="sg-quiz-foot">
          <div className="sg-quiz-decay">
            <span className="sg-quiz-decay-lbl">decay</span>
            <span className="sg-quiz-decay-bar"><span className="sg-quiz-decay-fill" style={{width: `${pct*100}%`}} /></span>
            <span className="sg-quiz-decay-time">{secondsLeft.toFixed(1)}s</span>
          </div>
          <span className="sg-quiz-foot-hint">paused during answer</span>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { SGCell, SGGrid, SGQuiz });
