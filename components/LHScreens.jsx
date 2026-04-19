// LeechHunt — Pre, Dossier, End screens

const LHPre = ({ pb, tweaks, onStart }) => (
  <div className="lh-pre" data-screen-label="lh-pre">
    <div className="lh-pre-head">
      <div className="lh-pre-eyebrow">▸ LEECH HUNT · BRIEFING</div>
      <div className="lh-pre-title">TARGETS ACQUIRED · {tweaks.leechCount}</div>
      <div className="lh-pre-sub">cards you keep missing · contain them or lose the run</div>
    </div>

    <div className="lh-pre-stages">
      <div className="lh-pre-stages-lbl">▸ CLEANSE PROTOCOL · 3 STAGES</div>
      <div className="lh-pre-stages-row">
        <div className="lh-pre-stage">
          <span className="lh-pre-stage-n">01</span>
          <span className="lh-pre-stage-t">RECOGNITION</span>
          <span className="lh-pre-stage-d">pick the meaning</span>
        </div>
        <div className="lh-pre-stage-arrow">▸</div>
        <div className="lh-pre-stage">
          <span className="lh-pre-stage-n">02</span>
          <span className="lh-pre-stage-t">READING</span>
          <span className="lh-pre-stage-d">pick the sound</span>
        </div>
        <div className="lh-pre-stage-arrow">▸</div>
        <div className="lh-pre-stage">
          <span className="lh-pre-stage-n">03</span>
          <span className="lh-pre-stage-t">APPLICATION</span>
          <span className="lh-pre-stage-d">pick the usage</span>
        </div>
      </div>
    </div>

    <div className="lh-pre-rules">
      <div className="lh-pre-rule">
        <span className="lh-rk lh-rk-ok">⊘</span>
        <span><b>PURGED</b> — clear all 3 stages first try · leech removed from the list</span>
      </div>
      <div className="lh-pre-rule">
        <span className="lh-rk lh-rk-warn">~</span>
        <span><b>WEAKENED</b> — any miss inside a leech · contamination drops but it survives</span>
      </div>
      <div className="lh-pre-rule">
        <span className="lh-rk lh-rk-bad">✗</span>
        <span><b>MISSION FAIL</b> — total misses across run exceeds cap</span>
      </div>
    </div>

    <div className="lh-pre-meta">
      <div className="lh-pre-meta-cell">
        <div className="lh-pre-meta-lbl">targets</div>
        <div className="lh-pre-meta-val">{tweaks.leechCount}</div>
      </div>
      <div className="lh-pre-meta-cell">
        <div className="lh-pre-meta-lbl">miss cap</div>
        <div className="lh-pre-meta-val">{tweaks.missCap === 99 ? '∞' : tweaks.missCap}</div>
      </div>
      {pb > 0 && (
        <div className="lh-pre-meta-cell is-pb">
          <div className="lh-pre-meta-lbl">best purge</div>
          <div className="lh-pre-meta-val">{pb}</div>
        </div>
      )}
    </div>

    <button className="lh-pre-start" onClick={onStart}>
      <span>▸ DEPLOY</span>
      <span className="arrow">◉</span>
    </button>

    <div className="lh-pre-hint">
      <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> pick · <kbd>ESC</kbd> abort
    </div>
  </div>
);

const SCRAMBLE_CHARS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝ▓▒░█';
const useScramble = (seed, len) => {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 110);
    return () => clearInterval(t);
  }, []);
  // Deterministic-ish per-row offset so rows scramble out of sync.
  const off = (seed * 7) % SCRAMBLE_CHARS.length;
  let out = '';
  for (let i = 0; i < len; i++) {
    out += SCRAMBLE_CHARS[(off + tick * (i+1) * 3 + i * 11) % SCRAMBLE_CHARS.length];
  }
  return out;
};

const LHRowMean = ({ leech, idx }) => {
  // Reveal real meaning only after the leech is resolved.
  const revealed = leech.status === 'purged' || leech.status === 'weakened' || leech.status === 'survived';
  const real = leech.card.mean.split(',')[0];
  const scrambled = useScramble(idx + 1, Math.min(real.length, 12));
  if (revealed) return <span className="lh-row-mean is-revealed">{real}</span>;
  return (
    <span className="lh-row-mean is-redacted" title="meaning withheld until resolved">
      <span className="lh-row-mean-tag">▸ TARGET</span>
      <span className="lh-row-mean-scram">{scrambled}</span>
    </span>
  );
};

const LHLeechRow = ({ leech, onEngage, idx }) => {
  const pct = Math.round(leech.contamination * 100);
  const missCount = leech.history.filter(h => h === 'x').length;
  return (
    <div className={`lh-row lh-row-${leech.status}`} data-screen-label={`lh-leech-${idx}`}>
      <div className="lh-row-idx">#{String(idx+1).padStart(2,'0')}</div>
      <div className="lh-row-k">{leech.card.k}</div>
      <div className="lh-row-info">
        <div className="lh-row-info-top">
          <LHRowMean leech={leech} idx={idx} />
          <span className="lh-row-jlpt">N{leech.card.jlpt}</span>
        </div>
        <div className="lh-row-history">
          {leech.history.map((h, i) => (
            <span key={i} className={`lh-dot${h === 'x' ? ' is-miss' : ''}`}></span>
          ))}
          <span className="lh-row-miss-count">{missCount}/8 missed</span>
        </div>
        <div className="lh-row-bar">
          <span className="lh-row-bar-fill" style={{width: `${pct}%`}} />
          <span className="lh-row-bar-lbl">{pct}% contamination</span>
        </div>
      </div>
      <div className="lh-row-action">
        {leech.status === 'pending' && (
          <button className="lh-row-btn" onClick={() => onEngage(idx)}>
            <span>ENGAGE</span>
            <span className="arrow">▸</span>
          </button>
        )}
        {leech.status === 'purged' && <div className="lh-row-stat lh-stat-purged">⊘ PURGED</div>}
        {leech.status === 'weakened' && <div className="lh-row-stat lh-stat-weak">~ WEAKENED</div>}
        {leech.status === 'active' && <div className="lh-row-stat lh-stat-active">◉ ACTIVE</div>}
      </div>
    </div>
  );
};

const LHDossier = ({ roster, onEngage, purged, misses, missCap }) => (
  <div className="lh-dossier" data-screen-label="lh-dossier">
    <div className="lh-dossier-head">
      <div className="lh-dossier-stamp">▸ CLASSIFIED · LEECH REGISTRY</div>
      <div className="lh-dossier-status">
        <span className="lh-dossier-status-k">PURGED</span>
        <span className="lh-dossier-status-v">{purged}/{roster.length}</span>
      </div>
    </div>
    <div className="lh-list">
      {roster.map((leech, i) => (
        <LHLeechRow key={leech.id} leech={leech} onEngage={onEngage} idx={i} />
      ))}
    </div>
    <div className="lh-dossier-foot">
      <span>▸ engage a target to begin cleanse</span>
      {missCap !== 99 && (
        <span className="lh-dossier-cap">
          misses · <b className={misses >= missCap-1 ? 'is-warn' : ''}>{misses}</b>/{missCap}
        </span>
      )}
    </div>
  </div>
);

const LHEnd = ({ roster, purged, weakened, survived, result, beatPb, pb, misses, xpGained, onAgain, onHome }) => {
  const total = roster.length;
  const rate = total > 0 ? Math.round((purged/total)*100) : 0;
  const ribbon = result === 'fail' ? 'MISSION COMPROMISED'
    : rate === 100 ? 'TOTAL ERADICATION'
    : rate >= 75 ? 'HUNT SUCCESSFUL'
    : rate >= 50 ? 'PARTIAL CONTAINMENT'
    : 'LEECHES AT LARGE';
  const ribbonClr = result === 'fail' ? 'var(--danger)'
    : rate === 100 ? 'var(--accent-lime)'
    : rate >= 75 ? 'var(--accent-cyan)'
    : rate >= 50 ? 'var(--accent-amber)'
    : 'var(--accent-magenta)';

  // Breakdown mirrors LeechHunt.jsx grant formula exactly.
  const xpBase = total > 0 ? 30 : 0;
  const xpPurge = purged * 10;
  const xpComplete = result === 'complete' ? 20 : 0;
  const xpPb = beatPb ? 20 : 0;
  const isHot = window.Daily && window.Daily.hotChallengeId() === 'leech';
  const xpRaw = xpBase + xpPurge + xpComplete + xpPb;
  const xpHot = isHot ? Math.round(xpRaw * (window.Daily.HOT_MULTIPLIER - 1)) : 0;
  const xpTotal = xpGained ?? (xpRaw + xpHot);

  return (
    <div className="lh-end" data-screen-label="lh-end">
      <div className="lh-end-ribbon" style={{'--ribbon-clr': ribbonClr}}>
        <div className="lh-end-eyebrow">▸ LEECH HUNT · DEBRIEF</div>
        <div className="lh-end-ribbon-title">{ribbon}</div>
      </div>

      <div className="lh-end-stats">
        <div className="lh-end-stat lh-end-stat-purged">
          <div className="lh-end-stat-lbl">purged</div>
          <div className="lh-end-stat-val">{purged}</div>
          <div className="lh-end-stat-sub">removed from queue</div>
        </div>
        <div className="lh-end-stat lh-end-stat-weak">
          <div className="lh-end-stat-lbl">weakened</div>
          <div className="lh-end-stat-val">{weakened}</div>
          <div className="lh-end-stat-sub">re-queued</div>
        </div>
        <div className="lh-end-stat lh-end-stat-surv">
          <div className="lh-end-stat-lbl">survived</div>
          <div className="lh-end-stat-val">{survived}</div>
          <div className="lh-end-stat-sub">at large</div>
        </div>
      </div>

      {beatPb && <div className="lh-end-pb-beat">▲ NEW PURGE RECORD · prev {pb - (purged - pb)}</div>}

      {purged > 0 && (
        <div className="lh-end-group lh-end-group-purged">
          <div className="lh-end-group-head">
            <span>▸ PURGED · REMOVED FROM LEECH LIST</span>
            <span>{purged}</span>
          </div>
          <div className="lh-end-group-row">
            {roster.filter(l => l.status === 'purged').map((l, i) => (
              <div key={i} className="lh-end-chip is-purged" title={l.card.mean}>
                <span className="lh-end-chip-k">{l.card.k}</span>
                <span className="lh-end-chip-m">{l.card.mean.split(',')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {weakened > 0 && (
        <div className="lh-end-group lh-end-group-weak">
          <div className="lh-end-group-head">
            <span>▸ WEAKENED · REVIEW AGAIN</span>
            <span>{weakened}</span>
          </div>
          <div className="lh-end-group-row">
            {roster.filter(l => l.status === 'weakened').map((l, i) => (
              <div key={i} className="lh-end-chip is-weak" title={l.card.mean}>
                <span className="lh-end-chip-k">{l.card.k}</span>
                <span className="lh-end-chip-m">{l.card.mean.split(',')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {survived > 0 && (
        <div className="lh-end-group lh-end-group-surv">
          <div className="lh-end-group-head">
            <span>▸ AT LARGE · STILL LEECHING</span>
            <span>{survived}</span>
          </div>
          <div className="lh-end-group-row">
            {roster.filter(l => l.status === 'pending' || l.status === 'survived').map((l, i) => (
              <div key={i} className="lh-end-chip is-surv" title={l.card.mean}>
                <span className="lh-end-chip-k">{l.card.k}</span>
                <span className="lh-end-chip-m">{l.card.mean.split(',')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="lh-end-xp">
        <div className="lh-end-xp-head">
          <span>▸ XP EARNED</span>
          <span className="lh-end-xp-total">+{xpTotal}</span>
        </div>
        <div className="lh-end-xp-rows">
          <div className="lh-end-xp-row"><span>base</span><b>+{xpBase}</b></div>
          <div className="lh-end-xp-row"><span>purged · {purged}×10</span><b>+{xpPurge}</b></div>
          {xpComplete > 0 && <div className="lh-end-xp-row is-pb"><span>full hunt complete</span><b>+{xpComplete}</b></div>}
          {xpPb > 0 && <div className="lh-end-xp-row is-pb"><span>new record</span><b>+{xpPb}</b></div>}
          {isHot && <div className="lh-end-xp-row is-pb"><span>hot daily · ×{window.Daily.HOT_MULTIPLIER}</span><b>+{xpHot}</b></div>}
          <div className="lh-end-xp-row lh-streak"><span>daily streak</span><b>▲ +1</b></div>
        </div>
      </div>

      <div className="lh-end-actions">
        <button className="run-end-btn" onClick={onHome}>‹ HOME</button>
        <button className="run-end-btn primary" onClick={onAgain}>NEW HUNT ▸</button>
      </div>
    </div>
  );
};

Object.assign(window, { LHPre, LHDossier, LHEnd, LHLeechRow });
