// Shared daily-rotation helpers. Used by Home + each challenge mode so that
// the daily HOT pick (and its 3× XP multiplier) agree across screens.

(function () {
  const CHALLENGE_ORDER = ['time', 'survival', 'streak', 'leech', 'match'];

  function daySeed(d) {
    const date = d || new Date();
    const y = date.getFullYear();
    const m = date.getMonth();
    const day = date.getDate();
    let h = y * 1469598 + m * 8707 + day * 257 + 0x9e3779b1;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return Math.abs(h | 0);
  }

  function hotChallengeId(d) {
    return CHALLENGE_ORDER[daySeed(d) % CHALLENGE_ORDER.length];
  }

  window.Daily = { daySeed, hotChallengeId, HOT_MULTIPLIER: 3 };
})();
