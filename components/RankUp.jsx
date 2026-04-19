// RankUpModal — promotion ceremony. Shown on Home when window.Rank signals
// a pending promotion (via kb-promotion-pending localStorage marker).

const RankUpModal = ({ from, to, totalXp, onClose }) => {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const R = window.Rank;
  const next = R ? R.getNextRank(to) : null;
  const toNext = next ? Math.max(0, next.threshold - totalXp) : 0;

  return (
    <div className="ku-scrim" onClick={onClose}>
      <div className={`ku-modal tier-${to.color}`} onClick={e => e.stopPropagation()}>
        <span className="ku-corner tl">◤</span>
        <span className="ku-corner tr">◥</span>
        <span className="ku-corner bl">◣</span>
        <span className="ku-corner br">◢</span>

        <header className="ku-top">
          <span>▸ SYSTEM // PROMOTION_EVENT</span>
          <button className="ku-x" onClick={onClose} aria-label="dismiss">╳</button>
        </header>

        <div className="ku-pre">
          ▮ PROMOTION DETECTED<span className="ku-cursor">_</span>
        </div>

        <div className="ku-transition">
          <div className="ku-old">RANK {from.rom} · {from.name}</div>
          <div className="ku-arrow">▾</div>
          <div className="ku-rule" />
          <div className="ku-new">RANK {to.rom} · {to.name}</div>
          <div className="ku-rule" />
          <div className="ku-sweep" />
        </div>

        <div className="ku-plaque">
          <div className="ku-glyph">{to.glyph}</div>
          <div className="ku-kanji">{to.kanji}</div>
          <div className="ku-kana">{to.kana} &nbsp;—&nbsp; "{to.gloss}"</div>
        </div>

        <ul className="ku-stats">
          <li><span>› TOTAL XP</span><span>{totalXp.toLocaleString()}</span></li>
          <li><span>› RANK TIER</span><span>{String(to.i).padStart(2,'0')} / {window.Rank.RANKS.length}</span></li>
          <li><span>› NEXT THRESHOLD</span><span>{next ? toNext.toLocaleString() + ' XP' : '— MAX —'}</span></li>
        </ul>

        <button className="ku-ack" onClick={onClose}>▸ ACKNOWLEDGE</button>
      </div>
    </div>
  );
};

Object.assign(window, { RankUpModal });
