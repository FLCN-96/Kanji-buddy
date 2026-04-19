// Shared rank data + helpers. Loaded on every page so db.js/grantXp can
// detect promotions no matter which mode awarded the XP.

(function() {
  const RANKS = [
    { i:1,  rom:'Ⅰ',   name:'NOVICE',      kanji:'後輩',   kana:'KOUHAI',        gloss:'the junior',            glyph:'◇', color:'cyan',      threshold:0 },
    { i:2,  rom:'Ⅱ',   name:'CADET',       kanji:'解読',   kana:'KAIDOKU',       gloss:'the decipherer',        glyph:'◈', color:'cyan',      threshold:150 },
    { i:3,  rom:'Ⅲ',   name:'ADEPT',       kanji:'書士',   kana:'SHOSHI',        gloss:'the scribe',            glyph:'◆', color:'cyan',      threshold:550 },
    { i:4,  rom:'Ⅳ',   name:'SAVANT',      kanji:'暗号士', kana:'ANGŌ-SHI',      gloss:'the cryptographer',     glyph:'⬣', color:'cyan',      threshold:1400 },
    { i:5,  rom:'Ⅴ',   name:'OPERATOR',    kanji:'漢字士', kana:'KANJI-SHI',     gloss:'the character-hand',    glyph:'士', color:'magenta',   threshold:2800 },
    { i:6,  rom:'Ⅵ',   name:'ANALYST',     kanji:'字匠',   kana:'JI-SHŌ',        gloss:'the glyphwright',       glyph:'⬢', color:'magenta',   threshold:5000 },
    { i:7,  rom:'Ⅶ',   name:'ARCHIVIST',   kanji:'初段',   kana:'SHODAN',        gloss:'first dan',             glyph:'初', color:'magenta',   threshold:8200 },
    { i:8,  rom:'Ⅷ',   name:'SENTINEL',    kanji:'弐段',   kana:'NIDAN',         gloss:'second dan',            glyph:'弐', color:'magenta',   threshold:12600 },
    { i:9,  rom:'Ⅸ',   name:'ORACLE',      kanji:'参段',   kana:'SANDAN',        gloss:'third dan',             glyph:'参', color:'amber',     threshold:18500 },
    { i:10, rom:'Ⅹ',   name:'HIERARCH',    kanji:'四段',   kana:'YONDAN',        gloss:'fourth dan',            glyph:'四', color:'amber',     threshold:23000 },
    { i:11, rom:'Ⅺ',   name:'SAGE',        kanji:'賢者',   kana:'KENJA',         gloss:'the wise one',          glyph:'賢', color:'amber',     threshold:28500 },
    { i:12, rom:'Ⅻ',   name:'LORE-KEEPER', kanji:'古語士', kana:'KOGO-SHI',      gloss:'keeper of old words',   glyph:'古', color:'amber',     threshold:35000 },
    { i:13, rom:'ⅩⅢ', name:'MASTER',      kanji:'先生',   kana:'SENSEI',        gloss:'the teacher',           glyph:'師', color:'amber',     threshold:42500 },
    { i:14, rom:'ⅩⅣ', name:'GRANDMASTER', kanji:'大師',   kana:'TAISHI',        gloss:'great teacher',         glyph:'大', color:'transcend', threshold:52000 },
    { i:15, rom:'ⅩⅤ', name:'ASCENDANT',   kanji:'神使',   kana:'KAMI-TSUKAI',   gloss:'the divine envoy',      glyph:'神', color:'transcend', threshold:63000 },
    { i:16, rom:'ⅩⅥ', name:'IMMORTAL',    kanji:'不滅',   kana:'FUMETSU',       gloss:'the imperishable',      glyph:'不', color:'transcend', threshold:80000 },
  ];

  // Precomputed convenience field — keeps callers that read `.label` working.
  RANKS.forEach(r => { r.label = `RANK ${r.rom} · ${r.name}`; r.min = r.threshold; });

  const PROMO_KEY = 'kb-promotion-pending';

  const getRankForXp = (xp) => {
    let r = RANKS[0];
    for (const rr of RANKS) { if (xp >= rr.threshold) r = rr; else break; }
    return r;
  };

  const getNextRank = (rank) => RANKS.find(r => r.i === rank.i + 1) || null;

  // Dashboard historically used rankFor(xp) → { cur, next }. Keep that shape.
  const rankFor = (xp) => {
    const cur = getRankForXp(xp);
    const next = getNextRank(cur);
    return { cur, next };
  };

  const getRankProgress = (xp) => {
    const cur = getRankForXp(xp);
    const next = getNextRank(cur);
    if (!next) return { pct: 100, into: xp - cur.threshold, window: 0, cur, next: null };
    const into = xp - cur.threshold;
    const window = next.threshold - cur.threshold;
    return { pct: Math.min(100, Math.round(100 * into / window)), into, window, cur, next };
  };

  // Called by DB.grantXp after writing the new total. Records a one-shot
  // marker consumed by Home.html on next mount.
  const flagPromotion = (prevXp, newXp) => {
    const prev = getRankForXp(prevXp);
    const next = getRankForXp(newXp);
    if (next.i <= prev.i) return null;
    const payload = { fromI: prev.i, toI: next.i, at: Date.now() };
    try { localStorage.setItem(PROMO_KEY, JSON.stringify(payload)); } catch(e) {}
    return payload;
  };

  const consumePromotion = () => {
    try {
      const raw = localStorage.getItem(PROMO_KEY);
      if (!raw) return null;
      localStorage.removeItem(PROMO_KEY);
      const o = JSON.parse(raw);
      const from = RANKS.find(r => r.i === o.fromI);
      const to   = RANKS.find(r => r.i === o.toI);
      if (!from || !to) return null;
      return { from, to };
    } catch(e) { return null; }
  };

  const Rank = {
    RANKS, PROMO_KEY,
    getRankForXp, getNextRank, getRankProgress, rankFor,
    flagPromotion, consumePromotion,
  };

  window.Rank = Rank;
  window.rankFor = rankFor;
  window.RANK_TABLE = RANKS;
})();
