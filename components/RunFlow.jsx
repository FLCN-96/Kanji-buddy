// Pre-run and end screens

const PreRun = ({ state, total, onStart }) => {
  const conf = {
    fresh:  { count: total, new: 8, rev: 34, lch: 3, est: '~6m', acc: '84', cls: 'cyan', title: 'DAILY QUEUE · READY' },
    clear:  { count: 10, new: 0, rev: 10, lch: 0, est: '~2m', acc: '84', cls: 'cyan', title: 'QUEUE CLEAR · PRACTICE RUN' },
    behind: { count: 40, new: 22, rev: 141, lch: 17, est: '~15m', acc: '72', cls: 'amb', title: 'SRS DEBT · 180 OVERDUE' },
  }[state] || { count: total, new: 8, rev: 34, lch: 3, est: '~6m', acc: '84', cls: 'cyan', title: 'DAILY QUEUE · READY' };
  const bTotal = conf.new + conf.rev + conf.lch || 1;
  return (
    <div className="run-pre" data-screen-label="pre-run">
      <div className="run-pre-head">
        <div className="run-pre-lbl">▸ RUN · PRE-FLIGHT</div>
        <div className="run-pre-title">{conf.title}</div>
      </div>
      <div className="run-pre-stats">
        <div className="run-pre-stat">
          <div className="run-pre-stat-lbl">CARDS</div>
          <div className={`run-pre-stat-val ${conf.cls}`}>{conf.count}</div>
        </div>
        <div className="run-pre-stat">
          <div className="run-pre-stat-lbl">EST TIME</div>
          <div className="run-pre-stat-val">{conf.est}</div>
        </div>
        <div className="run-pre-stat">
          <div className="run-pre-stat-lbl">ACC · 7D</div>
          <div className={`run-pre-stat-val ${conf.cls}`}>{conf.acc} %</div>
        </div>
      </div>
      <div className="run-pre-breakdown">
        <div className="run-pre-breakdown-head">
          <span>▸ QUEUE COMPOSITION</span>
          <span>stack · core_2k + n3_kanji + wk_lv10</span>
        </div>
        <div className="run-pre-breakdown-bar">
          <div className="new" style={{width: `${100*conf.new/bTotal}%`}} />
          <div className="rev" style={{width: `${100*conf.rev/bTotal}%`}} />
          <div className="lch" style={{width: `${100*conf.lch/bTotal}%`}} />
        </div>
        <div className="run-pre-legend">
          <span><span className="dot new" /><b>new</b>{conf.new}</span>
          <span><span className="dot rev" /><b>review</b>{conf.rev}</span>
          <span><span className="dot lch" /><b>leech</b>{conf.lch}</span>
        </div>
      </div>
      <button className="run-pre-start" onClick={onStart}>
        <span>▸ RUN START</span>
        <span className="arrow">▸</span>
      </button>
      <div className="run-pre-hint">
        press <kbd>SPACE</kbd> to begin · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> for verdicts · <kbd>ESC</kbd> to quit
      </div>
    </div>
  );
};

const EndRun = ({ results, cards, duration, onAgain, onHome, variant }) => {
  const counts = { miss:0, hard:0, ok:0, easy:0 };
  results.forEach(r => { if (counts[r] != null) counts[r]++; });
  const total = results.length;
  const hits = counts.ok + counts.easy + counts.hard;
  const acc = total === 0 ? 0 : Math.round(100 * hits / total);
  const mm = Math.floor(duration / 60), ss = duration % 60;
  const durStr = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  const xp = hits * 10 + counts.easy * 5 - counts.miss * 2;
  const missedCards = results.map((r, i) => ({r, c: cards[i]})).filter(x => x.r === 'miss');

  return (
    <div className="run-end" data-screen-label="run-end">
      <div className="run-end-head">
        <div className="run-end-top">▸ RUN END · {durStr}</div>
        <div className="run-end-title">{acc >= 80 ? 'CLEAN RUN' : acc >= 60 ? 'RUN COMPLETE' : 'ROUGH RUN'}</div>
        <div className="run-end-acc">{acc}<span className="pct">%</span></div>
      </div>
      <div className="run-end-tallies">
        <div className="run-end-t">
          <div className="run-end-t-lbl">MISS</div>
          <div className="run-end-t-val miss">{counts.miss}</div>
        </div>
        <div className="run-end-t">
          <div className="run-end-t-lbl">HARD</div>
          <div className="run-end-t-val hard">{counts.hard}</div>
        </div>
        <div className="run-end-t">
          <div className="run-end-t-lbl">OK</div>
          <div className="run-end-t-val ok">{counts.ok}</div>
        </div>
        <div className="run-end-t">
          <div className="run-end-t-lbl">EASY</div>
          <div className="run-end-t-val easy">{counts.easy}</div>
        </div>
      </div>
      <div className="run-end-panels">
        <div className="run-end-panel">
          <div className="run-end-p-head"><span>▸ STREAK</span><span className="kb-cyan" style={{color:'var(--accent-cyan)'}}>▲ +1</span></div>
          <div className="run-end-p-val streak">13<span style={{fontSize:11,color:'var(--fg-2)',marginLeft:6,fontWeight:400,letterSpacing:'.12em',textTransform:'uppercase'}}>days</span></div>
          <div className="run-end-p-sub">next drop · 07:14:33</div>
        </div>
        {variant === 'game' ? (
          <div className="run-end-panel">
            <div className="run-end-p-head"><span>▸ XP GAINED</span><span style={{color:'var(--accent-magenta)'}}>RANK Ⅲ</span></div>
            <div className="run-end-p-val xp">+{xp}<span style={{fontSize:11,color:'var(--fg-2)',marginLeft:6,fontWeight:400,letterSpacing:'.12em',textTransform:'uppercase'}}>xp</span></div>
            <div className="run-end-p-sub">2,140 → {2140+xp} · 680 to rank Ⅳ</div>
          </div>
        ) : (
          <div className="run-end-panel">
            <div className="run-end-p-head"><span>▸ PACE</span><span>avg</span></div>
            <div className="run-end-p-val">{total ? Math.round(duration/total) : 0}<span style={{fontSize:11,color:'var(--fg-2)',marginLeft:6,fontWeight:400,letterSpacing:'.12em',textTransform:'uppercase'}}>s/card</span></div>
            <div className="run-end-p-sub">{total} cards · {durStr} total</div>
          </div>
        )}
      </div>
      {missedCards.length > 0 && (
        <div className="run-end-missed">
          <div className="run-end-missed-head">
            <span>▸ LEECH CANDIDATES · {missedCards.length}</span>
            <span className="hot">queued for retry</span>
          </div>
          <div className="run-end-missed-grid">
            {missedCards.map((x, i) => (
              <div key={i} className="run-end-missed-k" title={x.c.mean}>
                {x.c.k}
                <span className="m">{x.c.mean.split(',')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{height: 16}} />
      <div className="run-end-actions">
        <button className="run-end-btn" onClick={onHome}>‹ HOME</button>
        <button className="run-end-btn primary" onClick={onAgain}>RUN AGAIN ▸</button>
      </div>
    </div>
  );
};

Object.assign(window, { PreRun, EndRun });
