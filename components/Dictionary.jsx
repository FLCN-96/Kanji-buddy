// Dictionary — browse all kanji + their derived top-25 words.
// List view groups by JLPT tier; tap a kanji to drop into a detail view
// showing existing readings/examples (from cards.json) and the JMdict-
// derived top-25 (from kanji-words.json).
//
// Intentionally exploratory: minimal styling, no search/filter yet. The
// goal here is to make the new dataset browseable so we can decide what
// the production-quality dictionary UI should look like.

const TIER_LABELS = [
  { jlpt: 5, label: 'N5' },
  { jlpt: 4, label: 'N4' },
  { jlpt: 3, label: 'N3' },
  { jlpt: 2, label: 'N2' },
  { jlpt: 1, label: 'N1' },
  { jlpt: 0, label: 'no tier' },
];

const groupByTier = (cards) => {
  const buckets = new Map(TIER_LABELS.map(t => [t.jlpt, []]));
  for (const c of cards) {
    const j = c.jlpt || 0;
    if (!buckets.has(j)) buckets.set(j, []);
    buckets.get(j).push(c);
  }
  return TIER_LABELS.map(t => ({ ...t, cards: buckets.get(t.jlpt) || [] }))
    .filter(g => g.cards.length);
};

const DictTopbar = ({ subtitle, onBack }) => (
  <header className="kb-top">
    <div className="kb-wm-group">
      <div className="kb-wm">kanji-buddy</div>
    </div>
    <div className="kb-top-right">
      <span style={{color:'var(--fg-2)'}}>{subtitle}</span>
      {onBack ? (
        <button type="button" className="kb-dict-back" onClick={onBack}>◂ list</button>
      ) : (
        <a href="Home.html" className="kb-dict-back">◂ home</a>
      )}
    </div>
  </header>
);

const KanjiGrid = ({ cards, onPick }) => (
  <div className="kb-dict-grid">
    {cards.map(c => (
      <button
        key={c.idx}
        type="button"
        className="kb-dict-cell"
        onClick={() => onPick(c)}
        title={`${c.k} · ${c.mean || ''}`}
        data-kanji-idx={c.idx}
      >
        <span className="kb-dict-cell-k">{c.k}</span>
        <span className="kb-dict-cell-meta">{c.idx}</span>
      </button>
    ))}
  </div>
);

const ListView = ({ cards, onPick }) => {
  const groups = React.useMemo(() => groupByTier(cards), [cards]);
  return (
    <>
      <div className="kb-dict-intro">
        <div className="kb-dict-intro-line">▸ {cards.length} kanji · jōyō ladder</div>
        <div className="kb-dict-intro-sub">tap any kanji to view its readings, examples, and top-25 derived words.</div>
      </div>
      {groups.map(g => (
        <section key={g.label} className="kb-dict-group">
          <div className="kb-section-head">
            <span className="kb-section-title">{g.label}</span>
            <span className="kb-section-r">{g.cards.length} kanji</span>
          </div>
          <KanjiGrid cards={g.cards} onPick={onPick} />
        </section>
      ))}
      <div style={{height: 16}} />
    </>
  );
};

const ReadingChip = ({ r, gloss, main, dim }) => {
  if (!r) return null;
  return (
    <span className={`kb-dict-rd${main ? ' is-main' : ''}${dim ? ' is-dim' : ''}`}>
      <span className="kb-dict-rd-k">{r}</span>
      {gloss ? <span className="kb-dict-rd-g">{gloss}</span> : null}
    </span>
  );
};

const DetailView = ({ card, words }) => {
  const on = card.on || [];
  const kun = card.kun || [];
  const ex = card.ex || [];
  return (
    <article className="kb-dict-detail">
      <header className="kb-dict-detail-head">
        <div className="kb-dict-detail-k" lang="ja">{card.k}</div>
        <div className="kb-dict-detail-meta">
          <div className="kb-dict-detail-mean">{card.mean || '—'}</div>
          <div className="kb-dict-detail-row">
            <span className="kb-dict-detail-tag">idx · {card.idx}</span>
            <span className="kb-dict-detail-tag">{card.jlpt ? `N${card.jlpt}` : 'no tier'}</span>
            {card.strokes ? <span className="kb-dict-detail-tag">{card.strokes} strokes</span> : null}
            {card.rad ? <span className="kb-dict-detail-tag">radical {card.rad}</span> : null}
            {card.cls ? <span className="kb-dict-detail-tag kb-dict-detail-tag-dim">{card.cls}</span> : null}
          </div>
        </div>
      </header>

      <section className="kb-dict-block">
        <div className="kb-section-head">
          <span className="kb-section-title">readings</span>
          <span className="kb-section-r">on · kun</span>
        </div>
        <div className="kb-dict-rdgroup">
          <div className="kb-dict-rdrow">
            <span className="kb-dict-rdlbl">on</span>
            <div className="kb-dict-rds">
              {on.length ? on.map((o, i) => (
                <ReadingChip key={`on${i}`} r={o.r} gloss={o.gloss} main={o.main} />
              )) : <span className="kb-dict-empty">—</span>}
            </div>
          </div>
          <div className="kb-dict-rdrow">
            <span className="kb-dict-rdlbl">kun</span>
            <div className="kb-dict-rds">
              {kun.length ? kun.map((k, i) => (
                <ReadingChip key={`kun${i}`} r={k.r} gloss={k.gloss} main={k.main} />
              )) : <span className="kb-dict-empty">—</span>}
            </div>
          </div>
        </div>
      </section>

      {ex.length > 0 && (
        <section className="kb-dict-block">
          <div className="kb-section-head">
            <span className="kb-section-title">curated examples</span>
            <span className="kb-section-r">from cards.json</span>
          </div>
          <ul className="kb-dict-list">
            {ex.map((e, i) => (
              <li key={`ex${i}`} className="kb-dict-item">
                <span className="kb-dict-item-w" lang="ja">{e.w}</span>
                <span className="kb-dict-item-r">{e.r}</span>
                <span className="kb-dict-item-m">{e.m}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="kb-dict-block">
        <div className="kb-section-head">
          <span className="kb-section-title">derived top {Math.min(25, words.length)}</span>
          <span className="kb-section-r">jmdict frequency</span>
        </div>
        {words.length ? (
          <ol className="kb-dict-list kb-dict-list-numbered">
            {words.map((w, i) => (
              <li key={`w${i}`} className="kb-dict-item">
                <span className="kb-dict-item-rank">{String(i + 1).padStart(2, '0')}</span>
                <span className="kb-dict-item-w" lang="ja">{w.w}</span>
                <span className="kb-dict-item-r">{w.r}</span>
                <span className="kb-dict-item-m">{w.m}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="kb-dict-empty-block">no derived entries for this kanji yet.</div>
        )}
      </section>

      <div style={{height: 16}} />
    </article>
  );
};

const DictionaryApp = ({ cards, words }) => {
  const [selected, setSelected] = React.useState(null);

  // When opening a detail view, jump to top. When returning, restore
  // scroll close to the kanji we came from (best-effort via the cell id).
  const lastSelectedIdx = React.useRef(null);
  React.useEffect(() => {
    if (selected) {
      lastSelectedIdx.current = selected.idx;
      window.scrollTo(0, 0);
    } else if (lastSelectedIdx.current != null) {
      const cell = document.querySelector(`[data-kanji-idx="${lastSelectedIdx.current}"]`);
      if (cell && cell.scrollIntoView) {
        cell.scrollIntoView({ block: 'center' });
      }
    }
  }, [selected]);

  const subtitle = selected
    ? `${selected.k}`
    : `${cards.length} kanji`;

  return (
    <div className="kb-shell variant-game">
      <DictTopbar
        subtitle={subtitle}
        onBack={selected ? () => setSelected(null) : null}
      />
      <main className="kb-main" data-screen-label={selected ? 'dictionary-detail' : 'dictionary-list'}>
        {selected ? (
          <DetailView card={selected} words={words[String(selected.idx)] || []} />
        ) : (
          <ListView cards={cards} onPick={setSelected} />
        )}
      </main>
    </div>
  );
};

Object.assign(window, { DictionaryApp });
