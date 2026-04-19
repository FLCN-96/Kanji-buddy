// Survival — Pre / End screens

const SVPre = ({ pb, onStart, promptMode }) => {
  return (
    <div className="sv-pre" data-screen-label="sv-pre">
      <div className="sv-pre-head">
        <div className="sv-pre-eyebrow">▸ SURVIVAL · PRE-FLIGHT</div>
        <div className="sv-pre-title">ONE LIFE · GO DEEP</div>
      </div>

      <div className="sv-pre-rules">
        <div className="sv-pre-rule">
          <div className="sv-rk sv-rk-heart">♥</div>
          <div className="sv-rv">one miss ends the run</div>
        </div>
        <div className="sv-pre-rule">
          <div className="sv-rk">▼</div>
          <div className="sv-rv">depth climbs with each correct answer</div>
        </div>
        <div className="sv-pre-rule">
          <div className="sv-rk sv-rk-mag">⬡</div>
          <div className="sv-rv">JLPT tier hardens every 10 depth</div>
        </div>
        <div className="sv-pre-rule">
          <div className="sv-rk sv-rk-lime">✦</div>
          <div className="sv-rv">every 10 depth · sector cleared bonus</div>
        </div>
      </div>

      <div className="sv-pre-ladder">
        <div className="sv-pre-ladder-lbl">▸ DEPTH LADDER</div>
        <div className="sv-pre-ladder-rows">
          <div className="sv-pre-ladder-row"><span>0 — 9</span><span>JLPT N5</span><b>SHALLOW</b></div>
          <div className="sv-pre-ladder-row"><span>10 — 19</span><span>JLPT N4</span><b>—</b></div>
          <div className="sv-pre-ladder-row sv-deep"><span>15+</span><span>—</span><b style={{color:'#f5a524'}}>DEEP</b></div>
          <div className="sv-pre-ladder-row sv-abyss"><span>25+ · N3</span><span>—</span><b style={{color:'var(--accent-magenta)'}}>ABYSS</b></div>
          <div className="sv-pre-ladder-row sv-legend"><span>40+ · N2+</span><span>—</span><b style={{color:'#b8f1ff'}}>LEGEND</b></div>
        </div>
      </div>

      {pb > 0 && (
        <div className="sv-pre-pb">
          <div className="sv-pre-pb-lbl">▸ DEEPEST RUN</div>
          <div className="sv-pre-pb-val">{String(pb).padStart(3,'0')}</div>
          <div className="sv-pre-pb-sub">beat to earn +50 xp</div>
        </div>
      )}

      <button className="sv-pre-start" onClick={onStart}>
        <span>▸ DESCEND</span>
        <span className="arrow">▼</span>
      </button>

      <div className="sv-pre-hint">
        <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> pick · <kbd>ESC</kbd> quit · promptmode · {promptMode}
      </div>
    </div>
  );
};

const SVEnd = ({ depth, tier, beatPb, prevPb, killer, history, onAgain, onHome }) => {
  const xpBase = depth * 8;
  const xpBonus = beatPb ? 50 : 0;
  const xpSector = Math.floor(depth / 10) * 20;
  const xpTotal = xpBase + xpBonus + xpSector;

  return (
    <div className="sv-end" data-screen-label="sv-end">
      <div className="sv-end-head">
        <div className="sv-end-eyebrow">▸ SURVIVAL · FLATLINE</div>
      </div>

      <div className="sv-end-depth-row">
        <div className="sv-end-depth-block" style={{'--tier-color': tier.color}}>
          <div className="sv-end-depth-lbl">DEPTH REACHED</div>
          <div className="sv-end-depth-val">{String(depth).padStart(3,'0')}</div>
          <div className="sv-end-tier-name">▸ {tier.id}</div>
          {beatPb ? (
            <div className="sv-end-pb-beat">▲ NEW RECORD · prev {prevPb}</div>
          ) : prevPb > 0 ? (
            <div className="sv-end-pb-prev">best {prevPb} · −{prevPb - depth} to beat</div>
          ) : (
            <div className="sv-end-pb-prev">first run</div>
          )}
        </div>
      </div>

      {killer && (
        <div className="sv-end-killer">
          <div className="sv-end-killer-head">
            <span>▸ CAUSE OF DEATH</span>
            <span className="sv-end-killer-jlpt">N{killer.jlpt}</span>
          </div>
          <div className="sv-end-killer-body">
            <div className="sv-end-killer-glyph">{killer.k}</div>
            <div className="sv-end-killer-info">
              <div className="sv-end-killer-mean">{killer.mean}</div>
              <div className="sv-end-killer-reads">
                {killer.on.slice(0,2).map((r,i) => <span key={'on'+i} className="sv-read on">オン {r.r}</span>)}
                {killer.kun.slice(0,2).map((r,i) => <span key={'kn'+i} className="sv-read kn">クン {r.r}</span>)}
              </div>
              <div className="sv-end-killer-ex">
                {killer.ex && killer.ex.slice(0,1).map((e,i) => (
                  <div key={i}>
                    <b>{e.w}</b> <span className="r">{e.r}</span> — {e.m}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="sv-end-chain">
        <div className="sv-end-chain-head">
          <span>▸ LAST {history.length}</span>
          <span>correct · x {history.filter(h=>h.ok).length} / {history.length}</span>
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

      <div className="sv-end-xp">
        <div className="sv-end-xp-head">
          <span>▸ XP · STREAK IMPACT</span>
          <span className="sv-end-xp-total">+{xpTotal}</span>
        </div>
        <div className="sv-end-xp-rows">
          <div className="sv-end-xp-row"><span>depth bonus</span><b>+{xpBase}</b></div>
          <div className="sv-end-xp-row"><span>sectors cleared · {Math.floor(depth/10)}</span><b>+{xpSector}</b></div>
          {beatPb && <div className="sv-end-xp-row is-pb"><span>new personal best</span><b>+50</b></div>}
          <div className="sv-end-xp-row sv-streak"><span>daily streak</span><b>▲ +1</b></div>
        </div>
      </div>

      <div className="sv-end-actions">
        <button className="run-end-btn" onClick={onHome}>‹ HOME</button>
        <button className="run-end-btn primary" onClick={onAgain}>DESCEND AGAIN ▼</button>
      </div>
    </div>
  );
};

Object.assign(window, { SVPre, SVEnd });
