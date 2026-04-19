// .apkg browser parser — exposed as window.parseApkg(file, onProgress)
// Handles Anki 2.1.41+ (anki21b = zstd-compressed SQLite) and older (anki2 = plain SQLite)
//
// Returns: Promise<{ cards: KBCard[], deckName: string, total: number }>
//
// Lazy-loads: JSZip, fzstd, sql.js — fetched from CDN on first call, cached by SW thereafter.

const JSZIP_CDN = 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js';
const FZSTD_CDN = 'https://unpkg.com/fzstd@0.1.0/umd/index.js';
const SQLJS_CDN = 'https://unpkg.com/sql.js@1.10.3/dist/sql-wasm.js';
const WASM_URL  = 'https://unpkg.com/sql.js@1.10.3/dist/sql-wasm.wasm';

function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = url;
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.appendChild(s);
  });
}

// ── HTML field parsers (use browser DOMParser) ──────────────────────

function parseOn(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('p')].map(p => {
    const main = p.classList.contains('main-reading');
    p.querySelectorAll('.main-reading-terminator').forEach(n => n.remove());
    const r = p.textContent.trim();
    return r ? { r, gloss: null, main } : null;
  }).filter(Boolean);
}

function parseKun(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('p')].map(p => {
    const glossEl = p.querySelector('.kun-r-m');
    const gloss   = glossEl ? glossEl.textContent.trim() : null;
    glossEl?.remove();
    const r = p.textContent.trim();
    return r ? { r, gloss, main: false } : null;
  }).filter(Boolean);
}

function parseExamples(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('.example-block')].map(b => ({
    w: b.querySelector('ruby a')?.textContent.trim() || '',
    r: b.querySelector('rt')?.textContent.trim()     || '',
    m: b.querySelector('.example-meaning')?.textContent.trim() || '',
  })).filter(e => e.w);
}

function noteToCard(fields) {
  const [idxStr, kanji, svg, jlptStr, onHtml, kunHtml, mean, exHtml, rad, cls] = fields;
  return {
    idx:  parseInt(idxStr, 10) || 0,
    k:    kanji   || '',
    jlpt: parseInt(jlptStr, 10) || 0,
    on:   parseOn(onHtml),
    kun:  parseKun(kunHtml),
    mean: mean    || '',
    ex:   parseExamples(exHtml),
    rad:  rad     || '',
    cls:  cls     || '',
    svg:  svg     || '',
  };
}

// ── main export ─────────────────────────────────────────────────────

async function parseApkg(file, onProgress) {
  const emit = (step, detail) => onProgress && onProgress({ step, detail });

  // 1. Read file as ArrayBuffer
  emit('read', 'reading file...');
  const buffer = await file.arrayBuffer();

  // 2. Unzip
  emit('unzip', 'loading jszip...');
  await loadScript(JSZIP_CDN);
  const zip = await JSZip.loadAsync(buffer);

  // 3. Pick newer or older format
  const has21b = !!zip.files['collection.anki21b'];
  const entry  = has21b ? zip.files['collection.anki21b'] : zip.files['collection.anki2'];
  if (!entry) throw new Error('No collection file found in .apkg');

  // 4. Extract bytes
  emit('extract', `extracting ${has21b ? 'anki21b' : 'anki2'}...`);
  let bytes = await entry.async('uint8array');

  // 5. Decompress if needed
  if (has21b) {
    emit('decompress', 'loading fzstd...');
    await loadScript(FZSTD_CDN);
    emit('decompress', 'decompressing...');
    bytes = fzstd.decompress(bytes);
  }

  // 6. Init sql.js
  emit('sqlite', 'loading sql.js...');
  await loadScript(SQLJS_CDN);
  const SQL = await initSqlJs({ locateFile: () => WASM_URL });
  const db  = new SQL.Database(bytes);

  // 7. Find the kanji notetype (prefer "Romes Japanese Deck", fall back to first custom type)
  emit('schema', 'reading note types...');
  const ntRes = db.exec(`
    SELECT n.id, n.name
    FROM notetypes n
    WHERE n.name NOT IN ('Basic','Basic (and reversed card)','Basic (optional reversed card)',
                         'Basic (type in the answer)','Cloze','Image Occlusion')
    ORDER BY n.id
    LIMIT 1
  `);
  if (!ntRes.length || !ntRes[0].values.length) {
    throw new Error('No kanji notetype found in deck');
  }
  const [ntid, deckName] = ntRes[0].values[0];

  // 8. Get field names in order for this notetype
  const fldRes  = db.exec(`SELECT name FROM fields WHERE ntid = ${ntid} ORDER BY ord`);
  const fldNames = fldRes[0]?.values.map(r => r[0]) || [];
  emit('schema', `deck: "${deckName}" · ${fldNames.length} fields`);

  // 9. Count + read notes
  const cntRes = db.exec(`SELECT COUNT(*) FROM notes WHERE mid = ${ntid}`);
  const total  = cntRes[0]?.values[0]?.[0] || 0;
  emit('notes', `${total} notes found`);

  const notesRes = db.exec(`SELECT flds FROM notes WHERE mid = ${ntid} ORDER BY id`);
  if (!notesRes.length) throw new Error('No notes found for this notetype');

  const SEP = '\x1f';
  const rows = notesRes[0].values;
  const cards = [];

  for (let i = 0; i < rows.length; i++) {
    const fields = rows[i][0].split(SEP);
    const card   = noteToCard(fields);
    if (card.k) cards.push(card);
    if (i % 100 === 0) emit('parse', { done: i, total });
  }

  emit('parse', { done: cards.length, total: cards.length });
  db.close();

  return { cards, deckName, total: cards.length };
}

window.parseApkg = parseApkg;
