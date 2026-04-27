// Shared rank data + helpers. Loaded on every page so db.js/grantXp can
// detect promotions no matter which mode awarded the XP.

(function() {
  // 30 ranks across five tiers. Cyan/magenta/amber are the apprenticeship →
  // operator → adept arc. Transcend covers post-mortal mastery. Void are the
  // hackery near-impossible tiers — corrupted titles, intentionally unstable
  // text. Thresholds are tuned so finishing N5 lands the operator around
  // rank 7-9 (≈25% of the ladder), N4 → rank 12-14, N3 → rank 17-18, with
  // the top void ranks measured in years of consistent play.
  const RANKS = [
    { i:1,  rom:'Ⅰ',    name:'NOVICE',       kanji:'後輩',   kana:'KOUHAI',        gloss:'the junior',           glyph:'◇', color:'cyan',      threshold:0 },
    { i:2,  rom:'Ⅱ',    name:'CADET',        kanji:'入門',   kana:'NYŪMON',        gloss:'the entrant',          glyph:'◈', color:'cyan',      threshold:200 },
    { i:3,  rom:'Ⅲ',    name:'STUDENT',      kanji:'生徒',   kana:'SEITO',         gloss:'the pupil',            glyph:'◇', color:'cyan',      threshold:600 },
    { i:4,  rom:'Ⅳ',    name:'CIPHER',       kanji:'解読',   kana:'KAIDOKU',       gloss:'the decipherer',       glyph:'◈', color:'cyan',      threshold:1300 },
    { i:5,  rom:'Ⅴ',    name:'SCRIBE',       kanji:'書士',   kana:'SHOSHI',        gloss:'the scribe',           glyph:'◆', color:'cyan',      threshold:2400 },
    { i:6,  rom:'Ⅵ',    name:'SCRIVENER',    kanji:'写字',   kana:'SHAJI',         gloss:'the copyist',          glyph:'◆', color:'cyan',      threshold:4000 },
    { i:7,  rom:'Ⅶ',    name:'CRYPT',        kanji:'暗号士', kana:'ANGŌ-SHI',      gloss:'the cryptographer',    glyph:'⬣', color:'cyan',      threshold:6200 },
    { i:8,  rom:'Ⅷ',    name:'OPERATOR',     kanji:'漢字士', kana:'KANJI-SHI',     gloss:'the character-hand',   glyph:'士', color:'magenta',   threshold:9000 },
    { i:9,  rom:'Ⅸ',    name:'ANALYST',      kanji:'字匠',   kana:'JI-SHŌ',        gloss:'the glyphwright',      glyph:'⬢', color:'magenta',   threshold:12500 },
    { i:10, rom:'Ⅹ',    name:'SAVANT',       kanji:'文人',   kana:'BUNJIN',        gloss:'the literato',         glyph:'文', color:'magenta',   threshold:16800 },
    { i:11, rom:'Ⅺ',    name:'ARCHIVIST',    kanji:'初段',   kana:'SHODAN',        gloss:'first dan',            glyph:'初', color:'magenta',   threshold:22000 },
    { i:12, rom:'Ⅻ',    name:'SENTINEL',     kanji:'弐段',   kana:'NIDAN',         gloss:'second dan',           glyph:'弐', color:'magenta',   threshold:28200 },
    { i:13, rom:'ⅩⅢ',  name:'WARDEN',       kanji:'参段',   kana:'SANDAN',        gloss:'third dan',            glyph:'参', color:'magenta',   threshold:35500 },
    { i:14, rom:'ⅩⅣ',  name:'ORACLE',       kanji:'四段',   kana:'YONDAN',        gloss:'fourth dan',           glyph:'四', color:'magenta',   threshold:44000 },
    { i:15, rom:'ⅩⅤ',  name:'HIEROPHANT',   kanji:'五段',   kana:'GODAN',         gloss:'fifth dan',            glyph:'五', color:'amber',     threshold:54000 },
    { i:16, rom:'ⅩⅥ',  name:'HIERARCH',     kanji:'六段',   kana:'ROKUDAN',       gloss:'sixth dan',            glyph:'六', color:'amber',     threshold:65500 },
    { i:17, rom:'ⅩⅦ',  name:'SAGE',         kanji:'賢者',   kana:'KENJA',         gloss:'the wise one',         glyph:'賢', color:'amber',     threshold:78500 },
    { i:18, rom:'ⅩⅧ',  name:'LORE-KEEPER',  kanji:'古語士', kana:'KOGO-SHI',      gloss:'keeper of old words',  glyph:'古', color:'amber',     threshold:93000 },
    { i:19, rom:'ⅩⅨ',  name:'MASTER',       kanji:'先生',   kana:'SENSEI',        gloss:'the teacher',          glyph:'師', color:'amber',     threshold:109000 },
    { i:20, rom:'ⅩⅩ',  name:'GRANDMASTER',  kanji:'大師',   kana:'TAISHI',        gloss:'great teacher',        glyph:'大', color:'amber',     threshold:127000 },
    { i:21, rom:'ⅩⅪ',  name:'ASCENDANT',    kanji:'神使',   kana:'KAMI-TSUKAI',   gloss:'the divine envoy',     glyph:'神', color:'amber',     threshold:147000 },
    { i:22, rom:'ⅩⅫ',  name:'IMMORTAL',     kanji:'不滅',   kana:'FUMETSU',       gloss:'the imperishable',     glyph:'不', color:'transcend', threshold:170000 },
    { i:23, rom:'ⅩⅩⅢ', name:'PRIMORDIAL',   kanji:'始原',   kana:'SHIGEN',        gloss:'the origin',           glyph:'始', color:'transcend', threshold:200000 },
    { i:24, rom:'ⅩⅩⅣ', name:'CELESTIAL',    kanji:'天人',   kana:'TENNIN',        gloss:'the heavenly one',     glyph:'天', color:'transcend', threshold:240000 },
    { i:25, rom:'ⅩⅩⅤ', name:'DEMIURGE',     kanji:'造化',   kana:'ZŌKA',          gloss:'the creator',          glyph:'造', color:'transcend', threshold:295000 },
    // ── VOID TIER ─────────────────────────────────────────────────
    // Names carry combining-mark distortion + decorative chars. Keep them
    // single-line / single-glyph so layout doesn't collapse on narrow viewports.
    { i:26, rom:'ⅩⅩⅥ',  name:'ＳＰＥＣＴＲＥ',     kanji:'影',     kana:'KAGE',          gloss:'the residual',         glyph:'影', color:'void', threshold:370000 },
    { i:27, rom:'ⅩⅩⅦ',  name:'W̸RAITH',           kanji:'亡霊',   kana:'BŌREI',         gloss:'the lost soul',        glyph:'亡', color:'void', threshold:480000 },
    { i:28, rom:'ⅩⅩⅧ',  name:'D̷ÆMON',            kanji:'鬼神',   kana:'KIJIN',         gloss:'the spirit-demon',     glyph:'鬼', color:'void', threshold:650000 },
    { i:29, rom:'ⅩⅩⅨ',  name:'NULL_S̷ELF',        kanji:'虚',     kana:'KYO',           gloss:'the hollow',           glyph:'虚', color:'void', threshold:900000 },
    { i:30, rom:'ⅩⅩⅩ',  name:'K̷ANJI.exe',        kanji:'神隠',   kana:'KAMIKAKUSHI',   gloss:'spirited away',        glyph:'神', color:'void', threshold:1300000 },
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
