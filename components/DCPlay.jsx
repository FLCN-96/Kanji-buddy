// DECIPHER — Play surface. English prompt → blanks → 3×3 bank → controls.
//
// Bank tiles dim once consumed (rather than disappearing) so the operator
// can still see all 9 candidates while picking — and so a wrong duplicate
// pick stays possible until commit. The CLEAR button only surfaces when at
// least one blank is filled; SKIP is always available.

const DCPlay = ({ word, bank, picks, feedback, depth, lives, onPick, onClear, onSkip }) => {
  const usedBankIdxs = new Set(picks);
  const meaning = (word.m || '').split(';')[0].split(',').slice(0, 3).join(', ').trim();
  const fb = feedback; // 'ok' | 'bad' | null

  return (
    <div className={`dc-play${fb ? ` is-${fb}` : ''}`} data-screen-label="dc-play">
      {/* Prompt: english meaning + (tiny) reading hint */}
      <div className="dc-prompt">
        <div className="dc-prompt-eyebrow">▸ DECRYPT TARGET</div>
        <div className="dc-prompt-mean">{meaning || '—'}</div>
        {word.r && <div className="dc-prompt-read">{word.r}</div>}
      </div>

      {/* Blanks — one slot per target kanji */}
      <div className={`dc-blanks${fb === 'bad' ? ' is-shake' : ''}${fb === 'ok' ? ' is-flash' : ''}`}>
        {word.idxs.map((_, i) => {
          const tileIdx = picks[i];
          const filled = tileIdx != null;
          const ch = filled ? bank[tileIdx].k : '';
          const isNext = !filled && picks.length === i;
          return (
            <div
              key={i}
              className={`dc-blank${filled ? ' is-filled' : ''}${isNext ? ' is-next' : ''}`}
            >
              <span className="dc-blank-k">{ch || '·'}</span>
              <span className="dc-blank-underline" aria-hidden />
            </div>
          );
        })}
      </div>

      {/* Bank — 3×3 grid of kanji to choose from */}
      <div className="dc-bank" aria-label="kanji bank">
        {bank.map((card, i) => {
          const used = usedBankIdxs.has(i);
          return (
            <button
              key={`${card.idx}-${i}`}
              className={`dc-tile${used ? ' is-used' : ''}`}
              onClick={() => onPick(i)}
              disabled={!!fb}
              data-tile-idx={i}
              aria-label={`kanji ${card.k}`}
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
          disabled={!picks.length || !!fb}
        >
          ⟳ CLEAR
        </button>
        <div className="dc-controls-status" aria-live="polite">
          {fb === 'ok'  && <span className="dc-status-ok">▲ DECRYPTED</span>}
          {fb === 'bad' && <span className="dc-status-bad">✖ MISMATCH · ♥−1</span>}
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
