// Deck import screen — shown when no personal deck has been loaded yet

const DeckImport = ({ onDone }) => {
  const [phase, setPhase]     = React.useState('idle');  // idle | parsing | done | error
  const [drag,  setDrag]      = React.useState(false);
  const [log,   setLog]       = React.useState([]);
  const [result, setResult]   = React.useState(null);   // { deckName, total }
  const [errMsg, setErrMsg]   = React.useState('');
  const [pct,   setPct]       = React.useState(0);
  const fileRef = React.useRef(null);

  const addLog = (text, cls = '') => setLog(prev => [...prev, { text, cls }]);

  const handleFile = async (file) => {
    if (!file || !file.name.endsWith('.apkg')) {
      setErrMsg('File must be a .apkg file.');
      setPhase('error');
      return;
    }
    setPhase('parsing');
    setLog([]);
    setPct(0);
    setErrMsg('');

    const onProgress = ({ step, detail }) => {
      if (step === 'parse' && detail?.total > 0) {
        setPct(Math.round((detail.done / detail.total) * 100));
        if (detail.done === detail.total) addLog(`▸ parsed ${detail.total} cards`, 'ok');
      } else {
        const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
        const cls = step === 'schema' || step === 'notes' ? 'ok' : '';
        addLog(`› ${msg}`, cls);
      }
    };

    try {
      const { cards, deckName, total } = await window.parseApkg(file, onProgress);
      addLog(`▸ saving to IndexedDB...`, '');
      await window.DB.saveImportedCards(cards);
      await window.DB.updateUser({ settings: { deckChoice: 'imported' } });
      setResult({ deckName, total });
      setPhase('done');
    } catch (e) {
      setErrMsg(e.message || 'Parse failed.');
      setPhase('error');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const onBrowse = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const useBundled = async () => {
    await window.DB.updateUser({ settings: { deckChoice: 'bundled' } }).catch(() => {});
    onDone('bundled');
  };

  const proceed = () => onDone('imported');

  // ── Styles ──────────────────────────────────────────────────────

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(10,14,20,.96)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-mono)',
  };

  const panel = {
    width: '90%', maxWidth: 460,
    background: 'var(--bg-1)',
    border: `1px solid ${phase === 'done' ? 'var(--accent-cyan)' : 'var(--accent-magenta)'}`,
    boxShadow: phase === 'done'
      ? '0 0 40px rgba(0,229,255,.25)'
      : '0 0 40px rgba(233,111,207,.2)',
    padding: '24px 24px 20px',
    transition: 'border-color .4s, box-shadow .4s',
  };

  const dangerHead = {
    borderBottom: `1px solid ${phase === 'done' ? 'var(--accent-cyan)' : 'var(--accent-magenta)'}`,
    paddingBottom: 14, marginBottom: 20,
    display: 'flex', alignItems: 'center', gap: 10,
  };

  const skull = {
    fontSize: 22,
    color: phase === 'done' ? 'var(--accent-cyan)' : 'var(--accent-magenta)',
    textShadow: phase === 'done'
      ? '0 0 10px var(--accent-cyan)'
      : '0 0 10px var(--accent-magenta)',
  };

  const headText = {
    fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase',
    color: phase === 'done' ? 'var(--accent-cyan)' : 'var(--accent-magenta)',
  };

  const dropZone = {
    border: `2px dashed ${drag ? 'var(--accent-cyan)' : 'rgba(233,111,207,.5)'}`,
    padding: '28px 20px',
    textAlign: 'center', cursor: 'pointer',
    background: drag ? 'rgba(0,229,255,.05)' : 'transparent',
    transition: 'border-color .2s, background .2s',
    marginBottom: 14,
  };

  const logBox = {
    background: 'var(--bg-0)', border: '1px solid var(--bg-2)',
    padding: '10px 12px', fontSize: 11, lineHeight: 1.8,
    maxHeight: 180, overflowY: 'auto',
    marginBottom: 14, color: 'var(--fg-2)', letterSpacing: '.04em',
  };

  const btn = (primary) => ({
    display: 'block', width: '100%', padding: '11px 0',
    fontFamily: 'var(--font-mono)', fontSize: 11,
    letterSpacing: '.14em', textTransform: 'uppercase',
    cursor: 'pointer', border: 'none',
    background: primary ? 'var(--accent-cyan)' : 'transparent',
    color: primary ? 'var(--bg-0)' : 'var(--fg-3)',
    borderTop: primary ? 'none' : '1px solid var(--bg-2)',
    marginTop: primary ? 0 : 10,
  });

  // ── Render phases ──────────────────────────────────────────────

  const renderIdle = () => (
    <>
      <div style={dangerHead}>
        <span style={skull}>☠</span>
        <div>
          <div style={headText}>DECK NOT INITIALIZED</div>
          <div style={{ color: 'var(--fg-3)', fontSize: 10, marginTop: 3 }}>
            no personal deck loaded
          </div>
        </div>
      </div>

      <div
        style={dropZone}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <div style={{ fontSize: 28, marginBottom: 8, opacity: .6 }}>⬆</div>
        <div style={{ color: 'var(--fg-1)', fontSize: 12, letterSpacing: '.08em' }}>
          DROP .APKG HERE
        </div>
        <div style={{ color: 'var(--fg-3)', fontSize: 10, marginTop: 6 }}>
          or click to browse
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".apkg"
          style={{ display: 'none' }}
          onChange={onBrowse}
        />
      </div>

      <button style={btn(false)} onClick={useBundled}>
        USE BUNDLED STARTER DECK
      </button>
      <div style={{ color: 'var(--fg-3)', fontSize: 9, textAlign: 'center', marginTop: 6 }}>
        bundled: 4,821 cards · your personal deck will not be imported
      </div>
    </>
  );

  const renderParsing = () => (
    <>
      <div style={dangerHead}>
        <span style={skull}>▸</span>
        <div style={headText}>PARSING DECK // {pct > 0 ? `${pct}%` : ''}</div>
      </div>
      <div style={logBox}>
        {log.map((l, i) => (
          <div key={i} style={{ color: l.cls === 'ok' ? 'var(--accent-cyan)' : 'var(--fg-2)' }}>
            {l.text}
          </div>
        ))}
      </div>
      {pct > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: 'var(--fg-3)', letterSpacing: '.1em', marginBottom: 4 }}>
            PARSE PROGRESS
          </div>
          <div style={{ background: 'var(--bg-0)', height: 4, position: 'relative' }}>
            <div style={{
              position: 'absolute', inset: 0, width: `${pct}%`,
              background: 'var(--accent-cyan)', boxShadow: '0 0 6px var(--accent-cyan)',
              transition: 'width .2s',
            }} />
          </div>
        </div>
      )}
    </>
  );

  const renderDone = () => (
    <>
      <div style={dangerHead}>
        <span style={skull}>✓</span>
        <div>
          <div style={headText}>DECK LOADED</div>
          <div style={{ color: 'var(--fg-2)', fontSize: 10, marginTop: 3 }}>
            {result?.deckName} · {result?.total?.toLocaleString()} cards
          </div>
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--fg-2)', marginBottom: 16, lineHeight: 1.7 }}>
        ▸ stored in IndexedDB<br />
        ▸ available offline<br />
        ▸ SRS state reset — ready for first run
      </div>
      <button style={btn(true)} onClick={proceed}>
        INITIALIZE RUN
      </button>
    </>
  );

  const renderError = () => (
    <>
      <div style={dangerHead}>
        <span style={skull}>✕</span>
        <div>
          <div style={headText}>PARSE FAILED</div>
          <div style={{ color: 'var(--fg-3)', fontSize: 10, marginTop: 3 }}>{errMsg}</div>
        </div>
      </div>
      <button style={btn(false)} onClick={() => setPhase('idle')}>TRY AGAIN</button>
      <button style={{ ...btn(false), marginTop: 6 }} onClick={useBundled}>
        USE BUNDLED DECK INSTEAD
      </button>
    </>
  );

  return (
    <div style={overlay}>
      <div style={panel}>
        {phase === 'idle'    && renderIdle()}
        {phase === 'parsing' && renderParsing()}
        {phase === 'done'    && renderDone()}
        {phase === 'error'   && renderError()}
      </div>
    </div>
  );
};

Object.assign(window, { DeckImport });
