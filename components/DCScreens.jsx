// DECIPHER — Pre + End screens. PreTitle/PreTicker/PreArm are shared with
// TimeAttack (loaded earlier as TAScreens.jsx). XP constants are duplicated
// here so the breakdown sums exactly to what Decipher.jsx granted.

const DC_XP_PER_WORD_R   = 6;
const DC_XP_DEPTH_STEP_R = 2;
const DC_XP_LIVES_KEEP_R = 8;
const DC_XP_PB_R         = 30;
const DC_XP_FLAWLESS_R   = 20;
const DC_LIVES_MAX_R     = 5;

const DCPre = ({ pb, onStart }) => {
  return (
    <div className="dc-pre" data-screen-label="dc-pre">
      <div className="dc-pre-head">
        <div className="dc-pre-eyebrow">▸ DECIPHER · KEY THE WORD</div>
        <PreTitle cls="dc-pre" text="KEY ▒▒▒▒ // DECODE" />
        <div className="dc-pre-sub">english on top · build the kanji form from the bank · 5 lives, go deep.</div>
        <PreTicker cls="dc-pre" text="› JMDICT FEED ARMED &nbsp; › DIFFICULTY: ADAPTIVE &nbsp; › LIVES: 5 &nbsp; › DEPTH: ∞ &nbsp; › SCALE TIPS TOWARD UNKNOWN AS YOU PUSH &nbsp; › ENGAGE WHEN READY &nbsp;&nbsp;" />
      </div>

      {/* Diagram — show the loop visually so the rules read on first glance */}
      <div className="dc-pre-diagram" aria-hidden>
        <div className="dc-pre-diag-prompt">favourable</div>
        <div className="dc-pre-diag-blanks">
          <span className="dc-pre-diag-blank is-filled">順</span>
          <span className="dc-pre-diag-blank is-active">▮</span>
        </div>
        <div className="dc-pre-diag-bank">
          <span className="dc-pre-diag-tile is-used">順</span>
          <span className="dc-pre-diag-tile">調</span>
          <span className="dc-pre-diag-tile">位</span>
          <span className="dc-pre-diag-tile">序</span>
          <span className="dc-pre-diag-tile">番</span>
          <span className="dc-pre-diag-tile">並</span>
          <span className="dc-pre-diag-tile">列</span>
          <span className="dc-pre-diag-tile">回</span>
          <span className="dc-pre-diag-tile">向</span>
        </div>
      </div>

      <div className="dc-pre-rules">
        <div className="dc-pre-rule">
          <span className="dc-rk">◉</span>
          <span>tap kanji in order to fill the blanks · auto-checks on last slot</span>
        </div>
        <div className="dc-pre-rule">
          <span className="dc-rk dc-rk-ok">▲</span>
          <span>correct = depth+1, bank gets sharper, xp tics up</span>
        </div>
        <div className="dc-pre-rule">
          <span className="dc-rk dc-rk-bad">♥−</span>
          <span>wrong commit = lose a life · 5 lives, game ends at zero</span>
        </div>
        <div className="dc-pre-rule">
          <span className="dc-rk dc-rk-neutral">⟳</span>
          <span><b>CLEAR</b> resets the current word for free · <b>SKIP</b> burns a life and deals next</span>
        </div>
      </div>

      <div className={`dc-pre-meta ${pb > 0 ? 'dc-pre-meta-2' : 'dc-pre-meta-1'}`}>
        <div className="dc-pre-meta-cell">
          <div className="dc-pre-meta-lbl">lives</div>
          <div className="dc-pre-meta-val">{DC_LIVES_MAX_R}</div>
        </div>
        {pb > 0 && (
          <div className="dc-pre-meta-cell is-pb">
            <div className="dc-pre-meta-lbl">best depth</div>
            <div className="dc-pre-meta-val">{pb}</div>
          </div>
        )}
      </div>

      <PreArm cls="dc-pre" readyLabel="▸ DECODER // ARMED" lockedLabel="◌ DECODER // COLD" />
      <button className="dc-pre-start" onClick={onStart}>
        <span>▸ ENGAGE</span>
        <span className="arrow">◉</span>
      </button>

      <div className="dc-pre-hint kbd-hint">
        <kbd>1</kbd>–<kbd>9</kbd> pick tile · <kbd>U</kbd>/<kbd>⌫</kbd> clear · <kbd>ESC</kbd> quit
      </div>
    </div>
  );
};

const DCEnd = ({ depth, livesKept, history, beatPb, pb, xpGained, hotTier, onAgain, onHome }) => {
  const wordsSolved = depth;
  const totalMisses = DC_LIVES_MAX_R - livesKept;
  const flawless = livesKept === DC_LIVES_MAX_R && depth >= 10;

  // Mirror Decipher.jsx XP formula exactly so the breakdown sums to xpGained.
  const xpWord    = wordsSolved * DC_XP_PER_WORD_R;
  const xpDepth   = depth * DC_XP_DEPTH_STEP_R;
  const xpLives   = livesKept * DC_XP_LIVES_KEEP_R;
  const xpPbRow   = beatPb ? DC_XP_PB_R : 0;
  const xpFlawRow = flawless ? DC_XP_FLAWLESS_R : 0;
  const hotMult = hotTier === 'gold' ? (window.Daily?.HOT_GOLD || 3)
                : hotTier === 'silver' ? (window.Daily?.HOT_SILVER || 1.5)
                : 1;
  const xpRaw = Math.max(0, xpWord + xpDepth + xpLives + xpPbRow + xpFlawRow);
  const xpHot = hotTier ? Math.round(xpRaw * (hotMult - 1)) : 0;
  const xpTotal = xpGained ?? (xpRaw + xpHot);

  const ribbon = depth >= 20 ? 'CRYPTANALYST'
    : depth >= 12 ? 'DEEP READER'
    : depth >= 6  ? 'SIGNAL LOCK'
    : depth >= 3  ? 'WARM TRACE'
    : 'COLD START';
  const ribbonClr = depth >= 20 ? 'var(--accent-magenta)'
    : depth >= 12 ? 'var(--accent-cyan)'
    : depth >= 6  ? 'var(--accent-amber, #f5a524)'
    : 'var(--fg-2)';

  const recent = history.slice(-6).reverse();

  return (
    <div className="dc-end" data-screen-label="dc-end">
      <div className="dc-end-ribbon" style={{'--ribbon-clr': ribbonClr}}>
        <div className="dc-end-eyebrow">▸ DECIPHER · DEBRIEF</div>
        <div className="dc-end-ribbon-title">{ribbon}</div>
      </div>

      <div className="dc-end-hero">
        <div className="dc-end-hero-score">
          <div className="dc-end-hero-lbl">DEPTH</div>
          <div className="dc-end-hero-val">{depth}</div>
          {beatPb
            ? <div className="dc-end-hero-pb">▲ NEW BEST · prev {pb - (depth - pb)}</div>
            : pb > 0
              ? <div className="dc-end-hero-pb-prev">best {pb} · −{Math.max(0, pb - depth + 1)} to beat</div>
              : <div className="dc-end-hero-pb-prev">first run</div>}
        </div>
        <div className="dc-end-hero-stats">
          <div className="dc-end-hero-stat">
            <div className="dc-end-hero-stat-lbl">words</div>
            <div className="dc-end-hero-stat-val">{wordsSolved}</div>
          </div>
          <div className="dc-end-hero-stat">
            <div className="dc-end-hero-stat-lbl">lives kept</div>
            <div className="dc-end-hero-stat-val">{livesKept}/{DC_LIVES_MAX_R}</div>
          </div>
          <div className="dc-end-hero-stat">
            <div className="dc-end-hero-stat-lbl">misses</div>
            <div className={`dc-end-hero-stat-val ${totalMisses === 0 ? 'is-good' : ''}`}>{totalMisses}</div>
          </div>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="dc-end-group">
          <div className="dc-end-group-head">
            <span>▸ LAST {recent.length}</span>
            <span className="dc-end-group-count">depth {depth}</span>
          </div>
          <div className="dc-end-row">
            {recent.map((h, i) => (
              <div key={i} className={`dc-end-chip${h.ok ? ' is-ok' : ' is-bad'}`}>
                <span className="dc-end-chip-w">{h.w}</span>
                {h.r && <span className="dc-end-chip-r">{h.r}</span>}
                <span className="dc-end-chip-m">{(h.m || '').split(',')[0].trim()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dc-end-xp">
        <div className="dc-end-xp-head">
          <span>▸ XP EARNED</span>
          <span className="dc-end-xp-total">+{xpTotal}</span>
        </div>
        <div className="dc-end-xp-rows">
          {xpWord  > 0 && <div className="dc-end-xp-row"><span>words · {wordsSolved}×{DC_XP_PER_WORD_R}</span><b>+{xpWord}</b></div>}
          {xpDepth > 0 && <div className="dc-end-xp-row"><span>depth · {depth}×{DC_XP_DEPTH_STEP_R}</span><b>+{xpDepth}</b></div>}
          {xpLives > 0 && <div className="dc-end-xp-row"><span>lives kept · {livesKept}×{DC_XP_LIVES_KEEP_R}</span><b>+{xpLives}</b></div>}
          {xpPbRow > 0 && <div className="dc-end-xp-row is-pb"><span>new personal best</span><b>+{xpPbRow}</b></div>}
          {xpFlawRow > 0 && <div className="dc-end-xp-row is-pb"><span>flawless · depth ≥ 10</span><b>+{xpFlawRow}</b></div>}
          {hotTier && <div className={`dc-end-xp-row is-pb is-hot is-${hotTier}`}><span>hot daily {hotTier} · ×{hotMult}</span><b>+{xpHot}</b></div>}
          <div className="dc-end-xp-row dc-end-xp-streak"><span>daily streak</span><b>▲ +1</b></div>
        </div>
      </div>

      <div className="dc-end-actions">
        <button className="run-end-btn" onClick={onHome}>‹ HOME</button>
        <button className="run-end-btn primary" onClick={onAgain}>RUN AGAIN ▸</button>
      </div>
    </div>
  );
};

Object.assign(window, { DCPre, DCEnd });
