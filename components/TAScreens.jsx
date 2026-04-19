// TimeAttack — Pre / Ready / End screens

const TAPre = ({ duration, onDuration, onStart, pb }) => {
  const DURS = [30, 60, 120];
  return (
    <div className="ta-pre" data-screen-label="ta-pre">
      <div className="ta-pre-head">
        <div className="ta-pre-eyebrow">▸ TIME ATTACK · PRE-FLIGHT</div>
        <div className="ta-pre-title">RECOGNIZE · PICK · REPEAT</div>
      </div>

      <div className="ta-pre-rules">
        <div className="ta-pre-rule">
          <div className="ta-rk">+1</div>
          <div className="ta-rv">per correct tile</div>
        </div>
        <div className="ta-pre-rule">
          <div className="ta-rk">+2</div>
          <div className="ta-rv">speed bonus · under 1.0s</div>
        </div>
        <div className="ta-pre-rule">
          <div className="ta-rk ta-rk-danger">−3s</div>
          <div className="ta-rv">from clock per miss</div>
        </div>
        <div className="ta-pre-rule">
          <div className="ta-rk ta-rk-mag">×3</div>
          <div className="ta-rv">combo celebrations</div>
        </div>
      </div>

      <div className="ta-pre-dur">
        <div className="ta-pre-dur-lbl">▸ ROUND LENGTH</div>
        <div className="ta-pre-dur-row">
          {DURS.map(d => (
            <button
              key={d}
              className={`ta-pre-dur-btn${duration === d ? ' is-active' : ''}`}
              onClick={() => onDuration(d)}
            >
              {d < 60 ? `${d}s` : d === 60 ? '60s' : `${d/60}m`}
            </button>
          ))}
        </div>
      </div>

      {pb > 0 && (
        <div className="ta-pre-pb">
          <div className="ta-pre-pb-lbl">▸ PERSONAL BEST · {duration}s</div>
          <div className="ta-pre-pb-val">{pb}</div>
          <div className="ta-pre-pb-sub">beat to earn +25 xp</div>
        </div>
      )}

      <button className="ta-pre-start" onClick={onStart}>
        <span>▸ START</span>
        <span className="arrow">▸</span>
      </button>

      <div className="ta-pre-hint">
        <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> pick tile · <kbd>ESC</kbd> quit
      </div>
    </div>
  );
};

const TAReadyDissolve = ({ n, display }) => {
  const shards = React.useMemo(() => {
    const arr = [];
    for (let i = 0; i < 14; i++) {
      const angle = (Math.PI * 2 * i) / 14 + (Math.random() - .5) * .3;
      const dist = 80 + Math.random() * 100;
      arr.push({
        id: i,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        rot: (Math.random() - .5) * 180,
        delay: 180 + Math.random() * 180,
        ch: '0123456789ABCDEF#░▓▒'.charAt(Math.floor(Math.random() * 20)),
      });
    }
    return arr;
  }, [n]);
  return (
    <div className="ta-cd ta-cd-dissolve" key={n}>
      <div className="ta-cd-num-d">{display}</div>
      <div className="ta-cd-shards">
        {shards.map(s => (
          <span key={s.id} className="ta-shard"
            style={{'--dx':`${s.dx}px`,'--dy':`${s.dy}px`,'--rot':`${s.rot}deg`, animationDelay: `${s.delay}ms`}}>{s.ch}</span>
        ))}
      </div>
    </div>
  );
};

const TAReadyMatrix = ({ n, display }) => {
  // 7 vertical columns of falling chars, the target digit revealed when columns finish
  const cols = React.useMemo(() => {
    return [...Array(7)].map((_, i) => ({
      id: i,
      chars: [...Array(6)].map(() => '0123456789ABCDEF一二三四五壱弐参'.charAt(Math.floor(Math.random() * 24))),
      delay: i * 60,
    }));
  }, [n]);
  return (
    <div className="ta-cd ta-cd-matrix" key={n}>
      <div className="ta-cd-matrix-cols">
        {cols.map(c => (
          <div key={c.id} className="ta-cd-mcol" style={{animationDelay: `${c.delay}ms`}}>
            {c.chars.map((ch, j) => <span key={j}>{ch}</span>)}
          </div>
        ))}
      </div>
      <div className="ta-cd-num-m">{display}</div>
    </div>
  );
};

const TAReadyShatter = ({ n, display }) => {
  // Split the glyph into 6 tall slivers that fly apart after a brief hold
  const slivers = [0,1,2,3,4,5];
  return (
    <div className="ta-cd ta-cd-shatter" key={n}>
      <div className="ta-cd-shatter-stack">
        {slivers.map(i => (
          <span key={i} className="ta-cd-sliver"
            style={{'--i': i, animationDelay: `${80 + i * 30}ms`}}>
            {display}
          </span>
        ))}
      </div>
    </div>
  );
};

const TAReadyBlocks = ({ n, display }) => {
  // A block grid "decodes" into the digit, then flickers off
  const CELLS = 48; // 8 cols x 6 rows
  const cells = React.useMemo(() => {
    return [...Array(CELLS)].map((_, i) => ({
      id: i,
      delay: Math.random() * 280,
      bright: Math.random() > 0.4,
    }));
  }, [n]);
  return (
    <div className="ta-cd ta-cd-blocks" key={n}>
      <div className="ta-cd-blocks-grid">
        {cells.map(c => (
          <span key={c.id}
            className={`ta-cd-cell${c.bright ? ' is-bright' : ''}`}
            style={{animationDelay: `${c.delay}ms`}} />
        ))}
      </div>
      <div className="ta-cd-num-b">{display}</div>
    </div>
  );
};

const TAReady = ({ n, variant = 'dissolve' }) => {
  const label = n === 3 ? 'FOCUS' : n === 2 ? 'READY' : n === 1 ? 'SET' : 'GO';
  const display = n > 0 ? String(n) : 'GO';
  const V = { dissolve: TAReadyDissolve, matrix: TAReadyMatrix, shatter: TAReadyShatter, blocks: TAReadyBlocks }[variant] || TAReadyDissolve;
  return (
    <div className="ta-ready" data-screen-label="ta-ready">
      <div className="ta-ready-stage">
        <V n={n} display={display} />
      </div>
      <div className="ta-ready-lbl" key={`l-${n}`}>{label}</div>
    </div>
  );
};

const TAEnd = ({ score, hits, misses, maxCombo, duration, tier, prevPb, beatPb, history, timedOut, onAgain, onHome }) => {
  const total = hits + misses;
  const acc = total === 0 ? 0 : Math.round(100 * hits / total);
  const avgMs = history.filter(h => h.ok).reduce((a,h) => a + h.ms, 0) / (hits || 1);
  const xpBase = hits * 5 + maxCombo * 2;
  const xpPb = beatPb ? 25 : 0;
  const xpTotal = xpBase + xpPb;
  const missed = history.filter(h => !h.ok);
  const fastest = history.filter(h => h.ok).slice().sort((a,b) => a.ms - b.ms)[0];

  return (
    <div className="ta-end" data-screen-label="ta-end">
      <div className="ta-end-head">
        <div className="ta-end-eyebrow">▸ TIME ATTACK · {timedOut ? 'TIME UP' : 'COMPLETE'}</div>
      </div>

      <div className="ta-end-score-row">
        <div className="ta-end-score-block">
          <div className="ta-end-score-lbl">SCORE</div>
          <div className="ta-end-score-val">{score}</div>
          {beatPb ? (
            <div className="ta-end-pb-beat">▲ NEW BEST · prev {prevPb}</div>
          ) : prevPb > 0 ? (
            <div className="ta-end-pb-prev">best {prevPb} · −{prevPb - score} to beat</div>
          ) : (
            <div className="ta-end-pb-prev">first run on {duration}s</div>
          )}
        </div>

        <div className="ta-end-tier" style={{'--tier-color': tier.color}}>
          <div className="ta-tier-ring">
            <div className="ta-tier-inner">
              <div className="ta-tier-lbl">RANK</div>
              <div className="ta-tier-name">{tier.id}</div>
            </div>
          </div>
          <div className="ta-tier-next">
            {(() => {
              const order = ['BRONZE','SILVER','GOLD','DIAMOND'];
              const i = order.indexOf(tier.id);
              if (i === order.length - 1) return 'MAX TIER';
              const next = TIER_TABLE.find(t => t.id === order[i+1]);
              return `${next.min - score} to ${order[i+1]}`;
            })()}
          </div>
        </div>
      </div>

      <div className="ta-end-stats">
        <div className="ta-end-stat">
          <div className="ta-end-stat-lbl">ACC</div>
          <div className="ta-end-stat-val">{acc}<span className="pct">%</span></div>
        </div>
        <div className="ta-end-stat">
          <div className="ta-end-stat-lbl">HITS</div>
          <div className="ta-end-stat-val ok">{hits}</div>
        </div>
        <div className="ta-end-stat">
          <div className="ta-end-stat-lbl">MISS</div>
          <div className="ta-end-stat-val miss">{misses}</div>
        </div>
        <div className="ta-end-stat">
          <div className="ta-end-stat-lbl">MAX · ×</div>
          <div className="ta-end-stat-val mag">{maxCombo}</div>
        </div>
        <div className="ta-end-stat">
          <div className="ta-end-stat-lbl">AVG</div>
          <div className="ta-end-stat-val">{hits ? (avgMs/1000).toFixed(2) : '—'}<span className="pct">s</span></div>
        </div>
        <div className="ta-end-stat">
          <div className="ta-end-stat-lbl">FAST</div>
          <div className="ta-end-stat-val ok">{fastest ? (fastest.ms/1000).toFixed(2) : '—'}<span className="pct">s</span></div>
        </div>
      </div>

      <div className="ta-end-xp">
        <div className="ta-end-xp-head">
          <span>▸ XP · STREAK IMPACT</span>
          <span className="ta-end-xp-total">+{xpTotal}</span>
        </div>
        <div className="ta-end-xp-rows">
          <div className="ta-end-xp-row"><span>hit bonus</span><b>+{hits * 5}</b></div>
          <div className="ta-end-xp-row"><span>max combo bonus</span><b>+{maxCombo * 2}</b></div>
          {beatPb && <div className="ta-end-xp-row is-pb"><span>new personal best</span><b>+25</b></div>}
          <div className="ta-end-xp-row ta-end-xp-streak"><span>daily streak</span><b>▲ +1</b></div>
        </div>
      </div>

      {missed.length > 0 && (
        <div className="ta-end-missed">
          <div className="ta-end-missed-head">
            <span>▸ MISSED · {missed.length}</span>
            <span className="hot">queued for retry</span>
          </div>
          <div className="ta-end-missed-grid">
            {missed.map((h, i) => (
              <div key={i} className="ta-end-missed-k" title={h.card.mean}>
                {h.card.k}
                <span className="m">{h.card.mean.split(',')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ta-end-actions">
        <button className="run-end-btn" onClick={onHome}>‹ HOME</button>
        <button className="run-end-btn primary" onClick={onAgain}>RUN AGAIN ▸</button>
      </div>
    </div>
  );
};

Object.assign(window, { TAPre, TAReady, TAEnd });
