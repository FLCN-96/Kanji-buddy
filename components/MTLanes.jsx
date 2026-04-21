// MTLanes — two-column board with kanji left, value right.
// Each pair entry produces TWO tiles sharing the same `data-tile-id`.
// The left lane shows the kanji; the right lane shows the meaning OR reading.
// Value-column tiles are RANDOMLY ORDERED so positions don't leak the answer.
//
// Layout: a single CSS grid on `.mt-board` — row 1 holds the two lane headers,
// rows 2..N+1 hold paired tiles. Both lanes share the same grid row tracks, so
// the Nth kanji and Nth clue tile always occupy the same Y band even if the
// clue wraps to two lines. This replaces the previous per-lane flex stacks,
// which allowed rows to drift whenever content heights diverged.

const MTTile = ({ pair, col, isSelected, isShake, isResolved, onPick, gridRow, isUnseen }) => {
  const isKanji = col === 'k';
  // Unseen halo only on the kanji-side tile — the value (meaning/reading) is
  // a string, not a card to flag, and the green glow on the right lane makes
  // matching feel like a hint rather than a genuine unknown-term flag.
  const cls = [
    'mt-tile',
    isKanji ? 'mt-tile-k' : 'mt-tile-v',
    `mt-tile-side-${pair.side}`,
    isSelected ? 'is-selected' : '',
    isShake ? 'is-shake' : '',
    isResolved ? 'is-resolved' : '',
    isUnseen && isKanji ? 'is-unseen-frame' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      className={cls}
      data-tile-id={pair.id}
      data-col={col}
      onClick={() => onPick(col, pair.id)}
      disabled={isResolved}
      style={{gridRow, gridColumn: isKanji ? 1 : 2}}
    >
      {isKanji ? (
        <span className={`mt-tile-k-glyph${isUnseen ? ' is-unseen-glyph' : ''}`}>{pair.card.k}</span>
      ) : (
        <span className="mt-tile-v-text">{pair.value}</span>
      )}
      <span className="mt-tile-edge mt-tile-edge-tl" />
      <span className="mt-tile-edge mt-tile-edge-tr" />
      <span className="mt-tile-edge mt-tile-edge-bl" />
      <span className="mt-tile-edge mt-tile-edge-br" />
    </button>
  );
};

const MTLanes = ({ pairs, resolved, selected, shake, axis, onPick, seenSet }) => {
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

  const clueHeader = axis === 'mean' ? '▸ MEANING'
    : axis === 'read' ? '▸ READING'
    : '▸ MEANING / READING';

  const boardCls = [
    'mt-board',
    `mt-board-${pairs.length}`,
    axis === 'mix' ? 'is-axis-mix' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={boardCls} data-screen-label="mt-board">
      <div className="mt-lane-head mt-lane-head-k" style={{gridRow: 1, gridColumn: 1}}>
        <span className="mt-lane-head-tag">▸ KANJI</span>
        <span className="mt-lane-head-pulse" />
      </div>
      <div className="mt-lane-head mt-lane-head-v" style={{gridRow: 1, gridColumn: 2}}>
        <span className="mt-lane-head-tag">{clueHeader}</span>
        <span className="mt-lane-head-pulse" />
      </div>

      {pairs.map((p, i) => (
        <MTTile
          key={p.id + ':k'}
          pair={p}
          col="k"
          gridRow={i + 2}
          isSelected={selected?.col === 'k' && selected.id === p.id}
          isShake={shake && shake.kId === p.id}
          isResolved={!!resolved[p.id]}
          onPick={onPick}
          isUnseen={isUnseen(p)}
        />
      ))}
      {valueOrder.map((p, i) => (
        <MTTile
          key={p.id + ':v'}
          pair={p}
          col="v"
          gridRow={i + 2}
          isSelected={selected?.col === 'v' && selected.id === p.id}
          isShake={shake && shake.vId === p.id}
          isResolved={!!resolved[p.id]}
          onPick={onPick}
          isUnseen={isUnseen(p)}
        />
      ))}
    </div>
  );
};

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

Object.assign(window, { MTLanes, MTTile });
