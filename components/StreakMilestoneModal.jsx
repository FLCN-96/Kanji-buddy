// StreakMilestoneModal — fired on Home when window.Streak.consumeMilestone()
// returns a payload (i.e. the user's streak just crossed 7 / 10 / 30 / 50 /
// 100 / 200 / 365 / 500 / 1000 days). Visually mirrors RankUpModal so the
// celebration language is consistent across promotions and streak milestones.

const StreakMilestoneModal = ({ milestone, days, bestStreak, onClose }) => {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!milestone) return null;

  return (
    <div className="ku-scrim" onClick={onClose}>
      <div className="ku-modal ku-streak tier-amber" onClick={e => e.stopPropagation()}>
        <span className="ku-corner tl">◤</span>
        <span className="ku-corner tr">◥</span>
        <span className="ku-corner bl">◣</span>
        <span className="ku-corner br">◢</span>

        <header className="ku-top">
          <span>▸ SYSTEM // STREAK_MILESTONE</span>
          <button className="ku-x" onClick={onClose} aria-label="dismiss">╳</button>
        </header>

        <div className="ku-pre">
          ▮ STREAK ESCALATION DETECTED<span className="ku-cursor">_</span>
        </div>

        <div className="ku-transition">
          <div className="ku-old">{milestone.label}</div>
          <div className="ku-arrow">▾</div>
          <div className="ku-rule" />
          <div className="ku-new">{days} CONSECUTIVE DAYS</div>
          <div className="ku-rule" />
          <div className="ku-sweep" />
        </div>

        <div className="ku-plaque ku-streak-plaque">
          <div className="ku-glyph ku-streak-glyph">{milestone.glyph}</div>
          <div className="ku-kanji">{milestone.label}</div>
          <div className="ku-kana">{milestone.gloss.toUpperCase()} &nbsp;—&nbsp; "{days} days unbroken"</div>
        </div>

        <ul className="ku-stats">
          <li><span>› CURRENT STREAK</span><span>{days.toLocaleString()} d</span></li>
          <li><span>› PERSONAL BEST</span><span>{(bestStreak || days).toLocaleString()} d</span></li>
          <li><span>› MILESTONE TIER</span><span>{milestone.label}</span></li>
        </ul>

        <button className="ku-ack" onClick={onClose}>▸ ACKNOWLEDGE</button>
      </div>
    </div>
  );
};

Object.assign(window, { StreakMilestoneModal });
