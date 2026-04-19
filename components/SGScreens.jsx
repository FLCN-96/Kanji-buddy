// StreakGuard — Pre + End screens

const SGPre = ({ pb, cellCount, difficulty, onStart }) => {
  return (
    <div className="sg-pre" data-screen-label="sg-pre">
      <div className="sg-pre-head">
        <div className="sg-pre-eyebrow">▸ STREAK GUARD · TRIAGE</div>
        <div className="sg-pre-title">{cellCount} CARDS LEAKING</div>
        <div className="sg-pre-sub">rescue them before their decay window expires</div>
      </div>

      <div className="sg-pre-diagram" aria-hidden>
        <div className="sg-pre-diag-grid">
          {Array.from({length: 12}).map((_, i) => (
            <div key={i} className={`sg-pre-diag-cell ${i===0?'is-saved':i===1?'is-leaked':'is-drain'}`} style={{'--d': `${i * 0.11}s`}}>
              <span className="sg-pre-diag-bar" />
            </div>
          ))}
        </div>
        <div className="sg-pre-diag-legend">
          <span><i className="sg-leg sg-leg-live"/> live</span>
          <span><i className="sg-leg sg-leg-risk"/> draining</span>
          <span><i className="sg-leg sg-leg-saved"/> saved</span>
          <span><i className="sg-leg sg-leg-leaked"/> leaked</span>
        </div>
      </div>

      <div className="sg-pre-rules">
        <div className="sg-pre-rule">
          <span className="sg-rk">◉</span>
          <span>tap a cell to open its prompt — cell freezes while active</span>
        </div>
        <div className="sg-pre-rule">
          <span className="sg-rk sg-rk-ok">✓</span>
          <span>right answer = card saved, streak extended</span>
        </div>
        <div className="sg-pre-rule">
          <span className="sg-rk sg-rk-bad">✗</span>
          <span>wrong answer or decay timeout = card leaks, must re-learn</span>
        </div>
        <div className="sg-pre-rule">
          <span className="sg-rk sg-rk-neutral">⎋</span>
          <span>esc returns to grid — other cells keep draining</span>
        </div>
      </div>

      <div className={`sg-pre-meta sg-pre-meta-${pb > 0 ? 3 : 2}`}>
        <div className="sg-pre-meta-cell">
          <div className="sg-pre-meta-lbl">cards</div>
          <div className="sg-pre-meta-val">{cellCount}</div>
        </div>
        <div className="sg-pre-meta-cell">
          <div className="sg-pre-meta-lbl">difficulty</div>
          <div className="sg-pre-meta-val">{difficulty}</div>
        </div>
        {pb > 0 && (
          <div className="sg-pre-meta-cell is-pb">
            <div className="sg-pre-meta-lbl">best save</div>
            <div className="sg-pre-meta-val">{pb}</div>
          </div>
        )}
      </div>

      <button className="sg-pre-start" onClick={onStart}>
        <span>▸ ENGAGE TRIAGE</span>
        <span className="arrow">◉</span>
      </button>

      <div className="sg-pre-hint">
        <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> pick · <kbd>ESC</kbd> back / quit
      </div>
    </div>
  );
};

const SGEnd = ({ deck, saved, leaked, total, beatPb, pb, xpGained, onAgain, onHome }) => {
  const savedCards = deck.filter(c => c.status === 'saved');
  const leakedCards = deck.filter(c => c.status === 'leaked');
  const rate = total > 0 ? Math.round((saved/total)*100) : 0;
  const ribbon = rate === 100 ? 'PERFECT RESCUE' : rate >= 80 ? 'STRONG SAVE' : rate >= 50 ? 'MIXED RESULT' : 'CRITICAL LOSSES';
  const ribbonClr = rate === 100 ? 'var(--accent-lime)' : rate >= 80 ? 'var(--accent-cyan)' : rate >= 50 ? 'var(--accent-amber)' : 'var(--danger)';

  // Breakdown mirrors StreakGuard.jsx grant formula exactly.
  const xpBase = total > 0 ? 40 : 0;
  const xpSaved = saved * 8;
  const xpPerfect = rate === 100 && total > 0 ? 20 : 0;
  const xpPb = beatPb ? 20 : 0;
  const isHot = window.Daily && window.Daily.hotChallengeId() === 'streak';
  const xpRaw = xpBase + xpSaved + xpPerfect + xpPb;
  const xpHot = isHot ? Math.round(xpRaw * (window.Daily.HOT_MULTIPLIER - 1)) : 0;
  const xpTotal = xpGained ?? (xpRaw + xpHot);

  return (
    <div className="sg-end" data-screen-label="sg-end">
      <div className="sg-end-ribbon" style={{'--ribbon-clr': ribbonClr}}>
        <div className="sg-end-eyebrow">▸ STREAK GUARD · DEBRIEF</div>
        <div className="sg-end-ribbon-title">{ribbon}</div>
      </div>

      <div className="sg-end-bignum">
        <div className="sg-end-bignum-top">
          <span className="sg-end-saved">{saved}</span>
          <span className="sg-end-slash">/</span>
          <span className="sg-end-total">{total}</span>
        </div>
        <div className="sg-end-bignum-lbl">CARDS SAVED · {rate}%</div>
        {beatPb && <div className="sg-end-pb-beat">▲ NEW BEST · prev {pb - (saved - pb)}</div>}
      </div>

      <div className="sg-end-bars">
        <div className="sg-end-bar sg-end-bar-saved" style={{flex: saved || 0.001}}>
          <span>✓ {saved} saved</span>
        </div>
        <div className="sg-end-bar sg-end-bar-leaked" style={{flex: leaked || 0.001}}>
          <span>✗ {leaked} leaked</span>
        </div>
      </div>

      {savedCards.length > 0 && (
        <div className="sg-end-group sg-end-group-saved">
          <div className="sg-end-group-head">
            <span>▸ SAVED · INTERVAL BUMPED</span>
            <span className="sg-end-group-count">{savedCards.length}</span>
          </div>
          <div className="sg-end-group-row">
            {savedCards.map((c, i) => (
              <div key={i} className="sg-end-chip sg-end-chip-saved" title={c.card.mean}>
                <span className="sg-end-chip-k">{c.card.k}</span>
                <span className="sg-end-chip-m">+1d</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {leakedCards.length > 0 && (
        <div className="sg-end-group sg-end-group-leaked">
          <div className="sg-end-group-head">
            <span>▸ LEAKED · REQUEUED FOR RELEARN</span>
            <span className="sg-end-group-count">{leakedCards.length}</span>
          </div>
          <div className="sg-end-group-row">
            {leakedCards.map((c, i) => (
              <div key={i} className="sg-end-chip sg-end-chip-leaked" title={c.card.mean}>
                <span className="sg-end-chip-k">{c.card.k}</span>
                <span className="sg-end-chip-m">{c.card.mean.split(',')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sg-end-xp">
        <div className="sg-end-xp-head">
          <span>▸ XP EARNED</span>
          <span className="sg-end-xp-total">+{xpTotal}</span>
        </div>
        <div className="sg-end-xp-rows">
          <div className="sg-end-xp-row"><span>base</span><b>+{xpBase}</b></div>
          <div className="sg-end-xp-row"><span>saved · {saved}×8</span><b>+{xpSaved}</b></div>
          {xpPerfect > 0 && <div className="sg-end-xp-row is-pb"><span>perfect rescue</span><b>+{xpPerfect}</b></div>}
          {xpPb > 0 && <div className="sg-end-xp-row is-pb"><span>new record</span><b>+{xpPb}</b></div>}
          {isHot && <div className="sg-end-xp-row is-pb"><span>hot daily · ×{window.Daily.HOT_MULTIPLIER}</span><b>+{xpHot}</b></div>}
          <div className="sg-end-xp-row sg-streak"><span>daily streak</span><b>▲ +1</b></div>
        </div>
      </div>

      <div className="sg-end-actions">
        <button className="run-end-btn" onClick={onHome}>‹ HOME</button>
        <button className="run-end-btn primary" onClick={onAgain}>RUN AGAIN ▸</button>
      </div>
    </div>
  );
};

Object.assign(window, { SGPre, SGEnd });
