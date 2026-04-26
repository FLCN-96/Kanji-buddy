// RankLadderModal — opened when the user taps the XP bar on Home. Shows
// the full 16-rank ladder with the operator's current tier highlighted,
// XP-to-next, and per-tier glyph + gloss. No mutations — pure read.

const RankLadderModal = ({ totalXp, onClose }) => {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const R = window.Rank;
  const ranks = (R && R.RANKS) || [];
  const cur = R ? R.getRankForXp(totalXp) : null;
  const prog = R ? R.getRankProgress(totalXp) : null;
  const next = prog ? prog.next : null;
  const toNext = next ? Math.max(0, next.threshold - totalXp) : 0;

  return (
    <div className="kb-pop-scrim" onClick={onClose}>
      <div className="kb-pop kb-pop-rank" onClick={e => e.stopPropagation()}>
        <header className="kb-pop-top">
          <span>▸ RANK LADDER · {ranks.length} TIERS</span>
          <button className="kb-pop-x" onClick={onClose} aria-label="dismiss">╳</button>
        </header>

        <div className="kb-pop-summary">
          <div>
            <div className="kb-pop-summary-lbl">CURRENT</div>
            <div className="kb-pop-summary-val">{cur ? cur.label : '—'}</div>
          </div>
          <div>
            <div className="kb-pop-summary-lbl">LIFETIME XP</div>
            <div className="kb-pop-summary-val">{totalXp.toLocaleString()}</div>
          </div>
          <div>
            <div className="kb-pop-summary-lbl">{next ? 'TO NEXT' : 'STATUS'}</div>
            <div className="kb-pop-summary-val">
              {next ? `${toNext.toLocaleString()} XP` : 'MAX'}
            </div>
          </div>
        </div>

        {next && prog && (
          <div className="kb-pop-progress">
            <div className="kb-pop-progress-bar">
              <div className="kb-pop-progress-fill" style={{ width: `${prog.pct}%` }} />
            </div>
            <div className="kb-pop-progress-meta">
              <span>{(prog.into || 0).toLocaleString()} / {(prog.window || 0).toLocaleString()} XP</span>
              <span>→ {next.label}</span>
            </div>
          </div>
        )}

        <ul className="kb-pop-ladder">
          {ranks.map(r => {
            const reached = totalXp >= r.threshold;
            const isCur = cur && r.i === cur.i;
            return (
              <li
                key={r.i}
                className={`kb-pop-ladder-row tier-${r.color}${reached ? ' is-reached' : ''}${isCur ? ' is-current' : ''}`}
              >
                <span className="kb-pop-ladder-glyph">{r.glyph}</span>
                <span className="kb-pop-ladder-rom">{r.rom}</span>
                <span className="kb-pop-ladder-name">
                  <b>{r.name}</b>
                  <em>{r.kanji} · {r.kana.toLowerCase()}</em>
                </span>
                <span className="kb-pop-ladder-thr">
                  {r.threshold.toLocaleString()}
                  <span className="unit">XP</span>
                </span>
                {isCur && <span className="kb-pop-ladder-cursor">◀ you</span>}
              </li>
            );
          })}
        </ul>

        <button className="kb-pop-ack" onClick={onClose}>▸ CLOSE</button>
      </div>
    </div>
  );
};

Object.assign(window, { RankLadderModal });
