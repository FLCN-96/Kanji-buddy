// Survival — Pre / End screens

const SVPre = ({ pb, onStart, promptMode }) => {
  return (
    <div className="sv-pre" data-screen-label="sv-pre">
      <div className="sv-pre-head">
        <div className="sv-pre-eyebrow">// TRACE · PRE-FLIGHT</div>
        <PreTitle cls="sv-pre" text="ONE LIFE · GO DEEP" />
        <div className="sv-pre-sub">descend the system · one trace, no second pass</div>
        <PreTicker cls="sv-pre" text="› TRACE ACTIVE &nbsp; › ONE LIFE AUTHORIZED &nbsp; › DESCENT PROTOCOL: ENGAGED &nbsp; › FIREWALL HARDEN AT L-010 &nbsp; › SECTOR BREACH: POSSIBLE &nbsp; › SIGNAL: NOMINAL &nbsp;&nbsp;" />
      </div>

      <div className="sv-pre-rules">
        <div className="sv-pre-rule">
          <div className="sv-rk sv-rk-heart">♥</div>
          <div className="sv-rv">one miss · the trace catches you</div>
        </div>
        <div className="sv-pre-rule">
          <div className="sv-rk">▼</div>
          <div className="sv-rv">each correct answer drops a layer</div>
        </div>
        <div className="sv-pre-rule">
          <div className="sv-rk sv-rk-mag">⬡</div>
          <div className="sv-rv">firewalls harden every 10 layers</div>
        </div>
        <div className="sv-pre-rule">
          <div className="sv-rk sv-rk-lime">✦</div>
          <div className="sv-rv">layer breach · sector clear bonus</div>
        </div>
      </div>

      <div className="kb-unseen-legend">
        <span className="kb-unseen-legend-mk">新</span>
        <span className="kb-unseen-legend-msg">
          <b>green halo</b> = first sighting · result won't update SRS
        </span>
      </div>

      <div className="sv-pre-ladder">
        <div className="sv-pre-ladder-lbl">// LAYER MAP</div>
        <div className="sv-pre-ladder-rows">
          <div className="sv-pre-ladder-row"><span>L-000 → L-009</span><span>N5</span><b>SHALLOW</b></div>
          <div className="sv-pre-ladder-row sv-deep"><span>L-015 → L-024</span><span>N4 → N3</span><b style={{color:'#f5a524'}}>DEEP</b></div>
          <div className="sv-pre-ladder-row sv-abyss"><span>L-025 → L-039</span><span>N3 → N2</span><b style={{color:'var(--accent-magenta)'}}>ABYSS</b></div>
          <div className="sv-pre-ladder-row sv-legend"><span>L-040+</span><span>N1</span><b style={{color:'#b8f1ff'}}>LEGEND</b></div>
        </div>
      </div>

      {pb > 0 && (
        <div className="sv-pre-pb">
          <div className="sv-pre-pb-lbl">// DEEPEST</div>
          <div className="sv-pre-pb-val">L-{String(pb).padStart(3,'0')}</div>
          <div className="sv-pre-pb-sub">beat the record · +50 xp</div>
        </div>
      )}

      <PreArm cls="sv-pre" readyLabel="▸ LINE // LIVE" lockedLabel="◌ LINE // COLD" />
      <button className="sv-pre-start" onClick={onStart}>
        <span>JACK IN</span>
        <span className="arrow">▸</span>
      </button>

      <div className="sv-pre-hint">
        <span className="kbd-hint"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> select · <kbd>ESC</kbd> abort · </span>cipher · {promptMode}
      </div>
    </div>
  );
};

const SVEnd = ({ depth, tier, beatPb, prevPb, killer, history, xpGained, onAgain, onHome }) => {
  // Breakdown mirrors Survival.jsx grant formula exactly.
  const xpBase = depth > 0 ? 40 : 0;
  const xpDepth = depth * 3;
  const xpPb = beatPb ? 30 : 0;
  const isHot = window.Daily && window.Daily.hotChallengeId() === 'survival';
  const xpRaw = xpBase + xpDepth + xpPb;
  const xpHot = isHot ? Math.round(xpRaw * (window.Daily.HOT_MULTIPLIER - 1)) : 0;
  const xpTotal = xpGained ?? (xpRaw + xpHot);
  const [showXp, setShowXp] = React.useState(false);

  return (
    <div className="sv-end" data-screen-label="sv-end">
      <div className="sv-end-head">
        <div className="sv-end-eyebrow">// CONNECTION TERMINATED</div>
        <div className="sv-end-sub">trace complete · origin compromised</div>
      </div>

      {/* HERO — depth + killer kanji merged. The killer is the dopamine. The
          depth is the score. Both should land in the same viewport. */}
      <div className="sv-end-hero" style={{'--tier-color': tier.color}}>
        <div className="sv-end-hero-killer">
          {killer ? (
            <>
              <div className="sv-end-hero-tag">▸ TRACE VECTOR · N{killer.jlpt}</div>
              <div className="sv-end-hero-glyph">{killer.k}</div>
              <div className="sv-end-hero-mean">{killer.mean}</div>
              <div className="sv-end-hero-reads">
                {killer.on.slice(0,2).map((r,i) => <span key={'on'+i} className="sv-read on">オン {r.r}</span>)}
                {killer.kun.slice(0,2).map((r,i) => <span key={'kn'+i} className="sv-read kn">クン {r.r}</span>)}
              </div>
              {killer.ex && killer.ex.slice(0,1).map((e,i) => (
                <div key={i} className="sv-end-hero-ex">
                  <b>{e.w}</b> <span className="r">{e.r}</span> — {e.m}
                </div>
              ))}
            </>
          ) : (
            <div className="sv-end-hero-tag">▸ NO TRACE · ABORTED</div>
          )}
        </div>
        <div className="sv-end-hero-depth">
          <div className="sv-end-depth-lbl">LAYERS BREACHED</div>
          <div className="sv-end-depth-val">L-{String(depth).padStart(3,'0')}</div>
          <div className="sv-end-tier-name">// {tier.id}</div>
          {beatPb ? (
            <div className="sv-end-pb-beat">▲ NEW RECORD · was L-{String(prevPb).padStart(3,'0')}</div>
          ) : prevPb > 0 ? (
            <div className="sv-end-pb-prev">deepest L-{String(prevPb).padStart(3,'0')} · −{prevPb - depth} to beat</div>
          ) : (
            <div className="sv-end-pb-prev">first connection</div>
          )}
        </div>
      </div>

      {/* Trace log — last 8 cells inline with the killer pulsing at the tail. */}
      {history.length > 0 && (
        <div className="sv-end-chain">
          <div className="sv-end-chain-head">
            <span>// TRACE LOG · LAST {history.length}</span>
            <span>{history.filter(h=>h.ok).length} / {history.length} clean</span>
          </div>
          <div className="sv-end-chain-row">
            {history.map((h, i) => (
              <div key={i} className={`sv-end-chain-cell${h.ok ? '' : ' is-miss'}${i === history.length-1 ? ' is-killer' : ''}`} title={h.card.mean}>
                <span className="sv-end-chain-k">{h.card.k}</span>
                <span className="sv-end-chain-mark">{h.ok ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* XP — single line by default. Tap to expand the breakdown. */}
      <div className={`sv-end-xp${showXp ? ' is-open' : ''}`}>
        <button
          className="sv-end-xp-head"
          onClick={() => setShowXp(s => !s)}
          aria-expanded={showXp}
        >
          <span>// INTEL RECOVERED</span>
          <span className="sv-end-xp-total">+{xpTotal} XP</span>
          <span className="sv-end-xp-toggle">{showXp ? '▴' : '▾'}</span>
        </button>
        {showXp && (
          <div className="sv-end-xp-rows">
            <div className="sv-end-xp-row"><span>base packet</span><b>+{xpBase}</b></div>
            <div className="sv-end-xp-row"><span>layer · {depth}×3</span><b>+{xpDepth}</b></div>
            {xpPb > 0 && <div className="sv-end-xp-row is-pb"><span>new record bonus</span><b>+{xpPb}</b></div>}
            {isHot && <div className="sv-end-xp-row is-pb"><span>hot daily · ×{window.Daily.HOT_MULTIPLIER}</span><b>+{xpHot}</b></div>}
            <div className="sv-end-xp-row sv-streak"><span>daily streak</span><b>▲ +1</b></div>
          </div>
        )}
      </div>

      <div className="sv-end-actions">
        <button className="run-end-btn" onClick={onHome}>‹ DISCONNECT</button>
        <button className="run-end-btn primary" onClick={onAgain}>JACK IN AGAIN ▸</button>
      </div>
    </div>
  );
};

Object.assign(window, { SVPre, SVEnd });
