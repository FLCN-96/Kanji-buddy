// MTPre + MTEnd

const MTPre = ({ pb, tweaks, onStart }) => {
  return (
    <div className="mt-pre" data-screen-label="mt-pre">
      <div className="mt-pre-head">
        <div className="mt-pre-eyebrow">▸ MATCH · LANE SPRINT</div>
        <div className="mt-pre-title">PAIR {tweaks.boardSize} · {tweaks.duration}s</div>
        <div className="mt-pre-sub">connect kanji to its meaning or reading. clear pairs, board refills.</div>
      </div>

      {/* Demo lane diagram */}
      <div className="mt-pre-diagram" aria-hidden>
        <div className="mt-pre-diag-col mt-pre-diag-col-k">
          <span className="mt-pre-diag-tile mt-pre-diag-tile-k">水</span>
          <span className="mt-pre-diag-tile mt-pre-diag-tile-k is-resolved">月</span>
          <span className="mt-pre-diag-tile mt-pre-diag-tile-k is-active">山</span>
        </div>
        <div className="mt-pre-diag-rail">
          <span className="mt-pre-diag-line is-active" />
          <span className="mt-pre-diag-cursor">◉</span>
        </div>
        <div className="mt-pre-diag-col mt-pre-diag-col-v">
          <span className="mt-pre-diag-tile mt-pre-diag-tile-v">water</span>
          <span className="mt-pre-diag-tile mt-pre-diag-tile-v is-resolved">moon</span>
          <span className="mt-pre-diag-tile mt-pre-diag-tile-v is-active">やま</span>
        </div>
      </div>

      <div className="mt-pre-rules">
        <div className="mt-pre-rule">
          <span className="mt-rk">◉</span>
          <span>tap kanji then its match (or vice versa)</span>
        </div>
        <div className="mt-pre-rule">
          <span className="mt-rk mt-rk-ok">▲</span>
          <span>faster matches = bigger speed bonus · combo multiplies</span>
        </div>
        <div className="mt-pre-rule">
          <span className="mt-rk mt-rk-bad">−2s</span>
          <span>wrong pair shakes red and burns 2 seconds</span>
        </div>
        <div className="mt-pre-rule">
          <span className="mt-rk mt-rk-neutral">⟳</span>
          <span>matched tiles vanish, fresh pairs slide in</span>
        </div>
      </div>

      <div className={`mt-pre-meta ${pb > 0 ? 'mt-pre-meta-3' : 'mt-pre-meta-2'}`}>
        <div className="mt-pre-meta-cell">
          <div className="mt-pre-meta-lbl">board</div>
          <div className="mt-pre-meta-val">{tweaks.boardSize}</div>
        </div>
        <div className="mt-pre-meta-cell">
          <div className="mt-pre-meta-lbl">axis</div>
          <div className="mt-pre-meta-val">{tweaks.axis === 'mix' ? 'MIX' : tweaks.axis === 'mean' ? 'MEAN' : 'READ'}</div>
        </div>
        {pb > 0 && (
          <div className="mt-pre-meta-cell is-pb">
            <div className="mt-pre-meta-lbl">best</div>
            <div className="mt-pre-meta-val">{pb}</div>
          </div>
        )}
      </div>

      <button className="mt-pre-start" onClick={onStart}>
        <span>▸ ENGAGE</span>
        <span className="arrow">◉</span>
      </button>

      <div className="mt-pre-hint">
        <kbd>SPACE</kbd> start · <kbd>ESC</kbd> deselect / quit
      </div>
    </div>
  );
};

const MTEnd = ({ score, matches, misses, bestCombo, history, beatPb, pb, duration, onAgain, onHome }) => {
  const acc = matches + misses > 0 ? Math.round((matches / (matches + misses)) * 100) : 100;
  const apm = Math.round(matches / (duration / 60));
  const ribbon = score >= 3000 ? 'PERFECT FLOW'
    : score >= 2000 ? 'STRONG SPRINT'
    : score >= 1000 ? 'SOLID PASS'
    : 'WARM-UP';
  const ribbonClr = score >= 3000 ? 'var(--accent-lime)'
    : score >= 2000 ? 'var(--accent-cyan)'
    : score >= 1000 ? 'var(--accent-amber)'
    : 'var(--accent-magenta)';

  // Top 3 fastest matches
  const fastest = [...history].sort((a,b) => a.speedSec - b.speedSec).slice(0, 3);
  const slowest = [...history].sort((a,b) => b.speedSec - a.speedSec).slice(0, 3);

  const xpMatches = matches * 10;
  const xpCombo = bestCombo * 5;
  const xpPb = beatPb ? 50 : 0;
  const xpTotal = xpMatches + xpCombo + xpPb;

  return (
    <div className="mt-end" data-screen-label="mt-end">
      <div className="mt-end-ribbon" style={{'--ribbon-clr': ribbonClr}}>
        <div className="mt-end-eyebrow">▸ MATCH · DEBRIEF</div>
        <div className="mt-end-ribbon-title">{ribbon}</div>
      </div>

      <div className="mt-end-hero">
        <div className="mt-end-hero-score">
          <div className="mt-end-hero-lbl">SCORE</div>
          <div className="mt-end-hero-val">{score.toLocaleString()}</div>
          {beatPb && <div className="mt-end-hero-pb">▲ NEW BEST · prev {pb - (score - pb)}</div>}
        </div>
        <div className="mt-end-hero-stats">
          <div className="mt-end-hero-stat">
            <div className="mt-end-hero-stat-lbl">matches</div>
            <div className="mt-end-hero-stat-val">{matches}</div>
          </div>
          <div className="mt-end-hero-stat">
            <div className="mt-end-hero-stat-lbl">accuracy</div>
            <div className={`mt-end-hero-stat-val ${acc >= 90 ? 'is-good' : acc < 70 ? 'is-bad' : ''}`}>{acc}%</div>
          </div>
          <div className="mt-end-hero-stat">
            <div className="mt-end-hero-stat-lbl">best combo</div>
            <div className="mt-end-hero-stat-val">×{bestCombo}</div>
          </div>
          <div className="mt-end-hero-stat">
            <div className="mt-end-hero-stat-lbl">pace · /min</div>
            <div className="mt-end-hero-stat-val">{apm}</div>
          </div>
        </div>
      </div>

      {fastest.length > 0 && (
        <div className="mt-end-group">
          <div className="mt-end-group-head">
            <span>▸ FASTEST PAIRS</span>
            <span className="mt-end-group-count">{fastest.length}</span>
          </div>
          <div className="mt-end-row">
            {fastest.map((m, i) => (
              <div key={i} className="mt-end-chip mt-end-chip-fast">
                <span className="mt-end-chip-k">{m.kanji}</span>
                <span className="mt-end-chip-arrow">→</span>
                <span className="mt-end-chip-v">{m.value}</span>
                <span className="mt-end-chip-time">{m.speedSec.toFixed(1)}s</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {slowest.length > 0 && history.length > 3 && (
        <div className="mt-end-group">
          <div className="mt-end-group-head">
            <span>▸ HESITATIONS</span>
            <span className="mt-end-group-count">{slowest.length}</span>
          </div>
          <div className="mt-end-row">
            {slowest.map((m, i) => (
              <div key={i} className="mt-end-chip mt-end-chip-slow">
                <span className="mt-end-chip-k">{m.kanji}</span>
                <span className="mt-end-chip-arrow">→</span>
                <span className="mt-end-chip-v">{m.value}</span>
                <span className="mt-end-chip-time">{m.speedSec.toFixed(1)}s</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-end-xp">
        <div className="mt-end-xp-head">
          <span>▸ XP EARNED</span>
          <span className="mt-end-xp-total">+{xpTotal}</span>
        </div>
        <div className="mt-end-xp-rows">
          <div className="mt-end-xp-row"><span>matches · {matches}×10</span><b>+{xpMatches}</b></div>
          <div className="mt-end-xp-row"><span>best combo · ×{bestCombo}</span><b>+{xpCombo}</b></div>
          {xpPb > 0 && <div className="mt-end-xp-row is-pb"><span>new record</span><b>+{xpPb}</b></div>}
          <div className="mt-end-xp-row mt-streak"><span>daily streak</span><b>▲ +1</b></div>
        </div>
      </div>

      <div className="mt-end-actions">
        <button className="run-end-btn" onClick={onHome}>‹ HOME</button>
        <button className="run-end-btn primary" onClick={onAgain}>RUN AGAIN ▸</button>
      </div>
    </div>
  );
};

Object.assign(window, { MTPre, MTEnd });
