// MTLanes — two-column board with kanji left, value right.
// Each pair entry produces TWO tiles sharing the same `data-tile-id`.
// The left lane shows the kanji; the right lane shows the meaning OR reading.
// Tiles in each lane are RANDOMLY ORDERED so positions don't leak the answer.

const MTTile = ({ pair, col, isSelected, isShake, isResolved, onPick, slotIdx, isUnseen }) => {
  const isKanji = col === 'k';
  // Unseen halo only on the kanji-side tile — the value (meaning/reading) is
  // a string, not a card to flag. The value tile borrows the same green
  // border via is-unseen-frame so the matched pair reads as a unit.
  const cls = [
    'mt-tile',
    isKanji ? 'mt-tile-k' : 'mt-tile-v',
    `mt-tile-side-${pair.side}`,
    isSelected ? 'is-selected' : '',
    isShake ? 'is-shake' : '',
    isResolved ? 'is-resolved' : '',
    isUnseen ? 'is-unseen-frame' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      className={cls}
      data-tile-id={pair.id}
      data-col={col}
      onClick={() => onPick(col, pair.id)}
      disabled={isResolved}
      style={{'--slot': slotIdx}}
    >
      {isKanji ? (
        <span className={`mt-tile-k-glyph${isUnseen ? ' is-unseen-glyph' : ''}`}>{pair.card.k}</span>
      ) : (
        <>
          <span className="mt-tile-v-tag">{pair.side === 'mean' ? 'MEANING' : 'READING'}</span>
          <span className="mt-tile-v-text">{pair.value}</span>
        </>
      )}
      <span className="mt-tile-edge mt-tile-edge-tl" />
      <span className="mt-tile-edge mt-tile-edge-tr" />
      <span className="mt-tile-edge mt-tile-edge-bl" />
      <span className="mt-tile-edge mt-tile-edge-br" />
    </button>
  );
};

const MTLanes = ({ pairs, resolved, selected, shake, combo, onPick, seenSet }) => {
  const isUnseen = (p) => seenSet ? !seenSet.has(p.card.idx) : false;
  // Stable shuffle per pair.id for value-column position
  const valueOrder = React.useMemo(() => {
    const order = [...pairs];
    // simple seed-by-id shuffle
    return order
      .map(p => ({p, k: hashStr(p.id) % 9973}))
      .sort((a,b) => a.k - b.k)
      .map(x => x.p);
  }, [pairs]);

  return (
    <div className={`mt-board mt-board-${pairs.length}${combo >= 3 ? ' is-combo' : ''}${combo >= 5 ? ' is-combo-hot' : ''}`} data-screen-label="mt-board">
      <div className="mt-lane mt-lane-k">
        <div className="mt-lane-head">
          <span className="mt-lane-head-tag">▸ KANJI</span>
          <span className="mt-lane-head-pulse" />
        </div>
        <div className="mt-lane-tiles">
          {pairs.map((p, i) => (
            <MTTile
              key={p.id + ':k'}
              pair={p}
              col="k"
              slotIdx={i}
              isSelected={selected?.col === 'k' && selected.id === p.id}
              isShake={shake && shake.kId === p.id}
              isResolved={!!resolved[p.id]}
              onPick={onPick}
              isUnseen={isUnseen(p)}
            />
          ))}
        </div>
      </div>

      {/* Center column: connector cable + match pulse */}
      <div className="mt-rail">
        <div className="mt-rail-spine" />
        {selected && (
          <div className="mt-rail-cursor" data-side={selected.col}>
            <span className="mt-rail-cursor-dot" />
          </div>
        )}
        {combo >= 3 && (
          <div className="mt-rail-combo">
            <span className="mt-rail-combo-x">×{combo}</span>
            <span className="mt-rail-combo-lbl">COMBO</span>
          </div>
        )}
      </div>

      <div className="mt-lane mt-lane-v">
        <div className="mt-lane-head">
          <span className="mt-lane-head-tag">▸ MEANING / READING</span>
          <span className="mt-lane-head-pulse" />
        </div>
        <div className="mt-lane-tiles">
          {valueOrder.map((p, i) => (
            <MTTile
              key={p.id + ':v'}
              pair={p}
              col="v"
              slotIdx={i}
              isSelected={selected?.col === 'v' && selected.id === p.id}
              isShake={shake && shake.vId === p.id}
              isResolved={!!resolved[p.id]}
              onPick={onPick}
              isUnseen={isUnseen(p)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

Object.assign(window, { MTLanes, MTTile });
