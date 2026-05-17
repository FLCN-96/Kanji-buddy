// DECIPHER — Play surface. English prompt → blanks → 3×3 bank → controls.
//
// State arrives slot-indexed: picks[i] is the bank idx chosen for slot i, or
// null. `locks` is the set of slot indices the operator has nailed (green —
// kanji is correct AND in the right slot). `eliminated` is the set of bank
// idxs ruled out (gray — kanji wasn't in the word at all on the prior
// commit). `status` is the per-slot Wordle classification, only set while
// `feedback === 'bad'` so the blanks can paint green/yellow/gray briefly
// before the non-locked picks clear and the operator gets another swing.

const DCPlay = ({ word, bank, picks, locks, eliminated, status, feedback, depth, lives, onPick, onClear, onSkip }) => {
  const meaning = (word.m || '').split(';')[0].split(',').slice(0, 3).join(', ').trim();
  const fb = feedback; // 'ok' | 'bad' | null

  // Next slot the operator's pick will land in (skips locked slots).
  let nextSlotIdx = -1;
  for (let i = 0; i < picks.length; i++) {
    if (locks.has(i)) continue;
    if (picks[i] == null) { nextSlotIdx = i; break; }
  }

  // CLEAR is meaningful only when something non-locked is currently picked.
  const canClear = picks.some((p, i) => p != null && !locks.has(i));

  const usedBankIdxs = new Set();
  for (const p of picks) if (p != null) usedBankIdxs.add(p);

  return (
    <div className={`dc-play${fb ? ` is-${fb}` : ''}`} data-screen-label="dc-play">
      {/* Prompt: english meaning + (tiny) reading hint */}
      <div className="dc-prompt">
        <div className="dc-prompt-eyebrow">▸ DECRYPT TARGET</div>
        <div className="dc-prompt-mean">{meaning || '—'}</div>
        {word.r && <div className="dc-prompt-read">{word.r}</div>}
      </div>

      {/* Blanks — one slot per target kanji.
          `is-locked` is the persistent green (committed correctly on a prior
          attempt). `is-green/yellow/gray` are the transient Wordle flash
          colors, applied only while `feedback === 'bad'`. */}
      <div className={`dc-blanks${fb === 'bad' ? ' is-shake' : ''}${fb === 'ok' ? ' is-flash' : ''}`}>
        {word.idxs.map((_, i) => {
          const tileIdx = picks[i];
          const filled = tileIdx != null;
          const ch = filled ? bank[tileIdx].k : '';
          const isLocked = locks.has(i);
          const isNext = i === nextSlotIdx;
          const slotStatus = status ? status[i] : null;
          const cls = [
            'dc-blank',
            filled ? 'is-filled' : '',
            isLocked ? 'is-locked' : '',
            isNext ? 'is-next' : '',
            slotStatus ? `is-${slotStatus}` : '',
          ].filter(Boolean).join(' ');
          return (
            <div key={i} className={cls}>
              <span className="dc-blank-k">{ch || '·'}</span>
              <span className="dc-blank-underline" aria-hidden />
              {isLocked && !fb && <span className="dc-blank-lock" aria-hidden>▮</span>}
            </div>
          );
        })}
      </div>

      {/* Bank — 3×3 grid. Eliminated tiles fade and stop accepting taps; tiles
          locked into a slot also dim (they're "spent" for the current word). */}
      <div className="dc-bank" aria-label="kanji bank">
        {bank.map((card, i) => {
          const isUsed = usedBankIdxs.has(i);
          const isElim = eliminated.has(i);
          const cls = [
            'dc-tile',
            isElim ? 'is-eliminated' : '',
            !isElim && isUsed ? 'is-used' : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={`${card.idx}-${i}`}
              className={cls}
              onClick={() => onPick(i)}
              disabled={!!fb || isElim || isUsed}
              data-tile-idx={i}
              aria-label={`kanji ${card.k}${isElim ? ' (eliminated)' : ''}`}
            >
              <span className="dc-tile-k">{card.k}</span>
              <span className="dc-tile-num" aria-hidden>{i + 1}</span>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="dc-controls">
        <button
          className="dc-ctl dc-ctl-clear"
          onClick={onClear}
          disabled={!canClear || !!fb}
          title="clear unlocked picks · greens stay locked"
        >
          ⟳ CLEAR
        </button>
        <div className="dc-controls-status" aria-live="polite">
          {fb === 'ok'  && <span className="dc-status-ok">▲ DECRYPTED</span>}
          {fb === 'bad' && <span className="dc-status-bad">✖ ♥−1 · greens lock · grays vanish</span>}
          {!fb && <span className="dc-status-dim">DEPTH {depth} · {lives} LIVES</span>}
        </div>
        <button
          className="dc-ctl dc-ctl-skip"
          onClick={onSkip}
          disabled={!!fb}
          title="skip this word · burns a life"
        >
          SKIP ♥−
        </button>
      </div>
    </div>
  );
};

Object.assign(window, { DCPlay });
