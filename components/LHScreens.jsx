// LeechHunt — Pre, Dossier, End screens

// SCRAMBLE_CHARS and useDecrypt come from TAScreens.jsx (loaded first in LeechHunt.html)
const useScramble = (seed, len) => {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 110);
    return () => clearInterval(t);
  }, []);
  const off = (seed * 7) % SCRAMBLE_CHARS.length;
  let out = '';
  for (let i = 0; i < len; i++) {
    out += SCRAMBLE_CHARS[(off + tick * (i+1) * 3 + i * 11) % SCRAMBLE_CHARS.length];
  }
  return out;
};

const LHPreTitle = ({ text }) => {
  const out = useDecrypt(text, 900);
  return <div className="lh-pre-title">{out}</div>;
};
const LHPreArm = () => {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setReady(true), 600);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="lh-pre-arm-lbl" data-state={ready ? 'ready' : 'locked'}>
      {ready ? '▸ ARM // READY' : '◌ ARM // LOCKED'}
    </div>
  );
};

const LHPre = ({ pb, tweaks, onStart }) => (
  <div className="lh-pre" data-screen-label="lh-pre">
    <div className="lh-pre-head">
      <div className="lh-pre-eyebrow">▸ INCOMING TRANSMISSION · 機密</div>
      <LHPreTitle text="▸ CONTRACT: GHOST SWEEP" />
      <div className="lh-pre-sub">{tweaks.leechCount} MARKS FLAGGED · 1 UNSEEN CANDIDATE</div>
      <div className="lh-pre-ticker" aria-hidden>
        <span className="lh-pre-ticker-track">
          › TRACE LOCKED &nbsp; › LEXICON BREACH LVL 3 &nbsp; › DECONTAMINATION AUTHORIZED &nbsp; › SIG: 0xA4F2 &nbsp; › DECK: K-9 &nbsp; › ICE: CLEAN &nbsp;&nbsp;
        </span>
      </div>
    </div>

    <div className="lh-pre-stages">
      <div className="lh-pre-stages-lbl">▸ PURGE SEQUENCE · 認 · 音 · 用</div>
      <div className="lh-pre-stages-row">
        <div className="lh-pre-stage">
          <span className="lh-pre-stage-n">01</span>
          <span className="lh-pre-stage-t">MARK</span>
          <span className="lh-pre-stage-d">identify the glyph</span>
        </div>
        <div className="lh-pre-stage-arrow">▸</div>
        <div className="lh-pre-stage">
          <span className="lh-pre-stage-n">02</span>
          <span className="lh-pre-stage-t">VOICE</span>
          <span className="lh-pre-stage-d">speak its sound</span>
        </div>
        <div className="lh-pre-stage-arrow">▸</div>
        <div className="lh-pre-stage">
          <span className="lh-pre-stage-n">03</span>
          <span className="lh-pre-stage-t">FIELD USE</span>
          <span className="lh-pre-stage-d">prove control</span>
        </div>
      </div>
    </div>

    <div className="lh-pre-rules">
      <div className="lh-pre-rule">
        <span className="lh-rk lh-rk-ok">⊘</span>
        <span><b>PURGED</b> — clear all 3 stages first try · glyph removed from registry</span>
      </div>
      <div className="lh-pre-rule">
        <span className="lh-rk lh-rk-warn">~</span>
        <span><b>SCRAMBLED</b> — any bleed inside a mark · contamination drops, glyph survives</span>
      </div>
      <div className="lh-pre-rule">
        <span className="lh-rk lh-rk-bad">✗</span>
        <span><b>CONTRACT VOID</b> — total bleeds across run exceed cap</span>
      </div>
    </div>

    <div className="kb-unseen-legend">
      <span className="kb-unseen-legend-mk">新</span>
      <span className="kb-unseen-legend-msg">
        <b>GREEN HALO</b> = UNSEEN GLYPH · bonus kill · result won't touch SRS
      </span>
    </div>

    <div className="lh-pre-meta">
      <div className="lh-pre-meta-cell">
        <div className="lh-pre-meta-lbl">marks</div>
        <div className="lh-pre-meta-val">{tweaks.leechCount}</div>
      </div>
      <div className="lh-pre-meta-cell">
        <div className="lh-pre-meta-lbl">bleed cap</div>
        <div className="lh-pre-meta-val">{tweaks.missCap === 99 ? '∞' : tweaks.missCap}</div>
      </div>
      {pb > 0 && (
        <div className="lh-pre-meta-cell is-pb">
          <div className="lh-pre-meta-lbl">record</div>
          <div className="lh-pre-meta-val">{pb}</div>
        </div>
      )}
    </div>

    <div className="lh-pre-arm">
      <LHPreArm />
      <button className="lh-pre-start" onClick={onStart}>
        <span>▸ DEPLOY</span>
        <span className="arrow">◉</span>
      </button>
    </div>

    <div className="lh-pre-hint kbd-hint">
      <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> pick · <kbd>ESC</kbd> abort
    </div>
  </div>
);

// Glyph subtitle — continuously scrambling redaction until the row is
// resolved, then a brief decrypt to the real meaning. Lives under the kanji
// inside .lh-row-glyph-cell rather than crowding the info column.
const LHRowGlyphSub = ({ leech, idx }) => {
  const resolved = leech.status === 'purged' || leech.status === 'weakened' || leech.status === 'survived';
  const real = leech.card.mean.split(',')[0];
  const scrambled = useScramble(idx + 1, Math.min(real.length, 8));
  if (resolved) return <span className="lh-row-glyph-sub">{real}</span>;
  return <span className="lh-row-glyph-sub" title="redacted · purge to decrypt">{scrambled}</span>;
};

// JLPT 5→1 maps to threat tiers D→S (N5 easiest, N1 apex).
const BOUNTY_TIERS = { 5: 'd', 4: 'c', 3: 'b', 2: 'a', 1: 's' };

const LHLeechRow = ({ leech, onEngage, idx }) => {
  const lapses = leech.lapses || 0;
  const filled = Math.min(lapses, 8);
  const tier = BOUNTY_TIERS[leech.card.jlpt] || 'd';
  const bleedCls = lapses >= 5 ? 'is-bad' : lapses >= 3 ? 'is-warn' : '';
  return (
    <div className={`lh-row lh-row-${leech.status}`} data-screen-label={`lh-leech-${idx}`}>
      <div className="lh-row-idx">#{String(idx+1).padStart(2,'0')}</div>
      <div className="lh-row-glyph-cell">
        <span className="lh-retic-mini lh-retic-mini-tl" />
        <span className="lh-retic-mini lh-retic-mini-tr" />
        <span className="lh-retic-mini lh-retic-mini-bl" />
        <span className="lh-retic-mini lh-retic-mini-br" />
        <span className="lh-row-k">{leech.card.k}</span>
        <LHRowGlyphSub leech={leech} idx={idx} />
      </div>
      <div className="lh-row-info">
        <div className="lh-row-meta" data-tier={tier}>
          <span>N{leech.card.jlpt}</span>
          <span className="lh-row-meta-sep">//</span>
          <span>THREAT</span>
          <span className="lh-row-meta-tier">{tier.toUpperCase()}</span>
          <span className="lh-row-meta-sep">//</span>
          <span className={`lh-row-meta-bleed ${bleedCls}`}>BLEEDS · {lapses > 8 ? '8+' : lapses}</span>
        </div>
        <div className="lh-row-bleed">
          <span className="lh-row-bleed-lbl">BLEED LOG</span>
          <span className="lh-row-bleed-dots">
            {Array.from({length: 8}, (_, i) => (
              <span key={i} className={`lh-dot${i < filled ? ' is-miss' : ''}`}></span>
            ))}
          </span>
        </div>
      </div>
      <div className="lh-row-action">
        {leech.status === 'pending' && (
          <button className="lh-row-btn" onClick={() => onEngage(idx)}>
            <span>PURGE</span>
            <span className="arrow">▸</span>
          </button>
        )}
        {leech.status === 'purged' && <div className="lh-row-seal" data-state="purged">⊘ PURGED · 浄化</div>}
        {leech.status === 'weakened' && <div className="lh-row-seal" data-state="weakened">~ SCRAMBLED · 乱</div>}
        {leech.status === 'active' && <div className="lh-row-seal" data-state="active">◉ ACTIVE · 標的</div>}
      </div>
    </div>
  );
};

const LHDossierStamp = () => {
  const out = useDecrypt('▸ DOSSIER // 機密 // LEECH REGISTRY', 800);
  return <div className="lh-dossier-stamp">{out}</div>;
};

const LHDossier = ({ roster, onEngage, purged, misses, missCap }) => {
  const total = roster.length || 4;
  const sigHex = React.useMemo(
    () => '0x' + Math.floor(Math.random()*0xFFFF).toString(16).toUpperCase().padStart(4,'0'),
    [],
  );
  return (
    <div className="lh-dossier" data-screen-label="lh-dossier">
      <div className="lh-dossier-head">
        <LHDossierStamp />
        <div className="lh-dossier-status">
          <span className="lh-dossier-status-k">NEUTRALIZED</span>
          <span className="lh-dossier-status-v">{purged}/{roster.length}</span>
          <span className="lh-dossier-status-bar" aria-hidden>
            {Array.from({length: total}, (_, i) => (
              <span key={i} className={`lh-dossier-status-seg${i < purged ? ' is-on' : ''}`} />
            ))}
          </span>
        </div>
      </div>
      <div className="lh-dossier-hud" aria-hidden>
        <div className="lh-dossier-hud-l">
          <span>SIG · <span className="is-on">{sigHex}</span></span>
          <span>TRACE · <span className="is-on">ACTIVE</span></span>
        </div>
        <div className="lh-dossier-hud-r">
          <span>ICE · CLEAN</span>
          <span>DECK · K-{roster.length || '?'}</span>
        </div>
      </div>
      <div className="lh-list">
        {roster.map((leech, i) => (
          <LHLeechRow key={leech.id} leech={leech} onEngage={onEngage} idx={i} />
        ))}
      </div>
      <div className="lh-dossier-foot">
        <span>▸ SELECT MARK // PURGE TO NEUTRALIZE</span>
        {missCap !== 99 && (
          <span className="lh-dossier-cap">
            BLEEDS // <b className={misses >= missCap-1 ? 'is-warn' : ''}>{misses}</b> OF {missCap}
          </span>
        )}
      </div>
    </div>
  );
};

const LHEnd = ({ roster, purged, weakened, survived, result, beatPb, pb, misses, xpGained, onAgain, onHome }) => {
  const total = roster.length;
  const rate = total > 0 ? Math.round((purged/total)*100) : 0;
  const ribbon = result === 'fail' ? 'CONTRACT VOID'
    : rate === 100 ? 'TOTAL PURGE · 完'
    : rate >= 75 ? 'CONTRACT CLEARED'
    : rate >= 50 ? 'PARTIAL PURGE'
    : 'MARKS AT LARGE';
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
        <div className="lh-end-eyebrow">▸ DEBRIEF // 報告</div>
        <div className="lh-end-ribbon-title">{ribbon}</div>
      </div>

      <div className="lh-end-stats">
        <div className="lh-end-stat lh-end-stat-purged">
          <div className="lh-end-stat-lbl">PURGED</div>
          <div className="lh-end-stat-val">{purged}</div>
          <div className="lh-end-stat-sub">removed from queue</div>
        </div>
        <div className="lh-end-stat lh-end-stat-weak">
          <div className="lh-end-stat-lbl">SCRAMBLED</div>
          <div className="lh-end-stat-val">{weakened}</div>
          <div className="lh-end-stat-sub">re-surfaces later</div>
        </div>
        <div className="lh-end-stat lh-end-stat-surv">
          <div className="lh-end-stat-lbl">AT LARGE</div>
          <div className="lh-end-stat-val">{survived}</div>
          <div className="lh-end-stat-sub">still bleeding</div>
        </div>
      </div>

      {beatPb && <div className="lh-end-pb-beat">▲ NEW PURGE RECORD · prev {pb - (purged - pb)}</div>}

      {purged > 0 && (
        <div className="lh-end-group lh-end-group-purged">
          <div className="lh-end-group-head">
            <span>▸ NEUTRALIZED // REMOVED FROM QUEUE</span>
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
            <span>▸ SCRAMBLED // RE-SURFACES LATER</span>
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
            <span>▸ AT LARGE // STILL BLEEDING</span>
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

Object.assign(window, { LHPre, LHDossier, LHEnd, LHLeechRow, useScramble, useDecrypt });
