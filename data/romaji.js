// Kana → romaji (modified Hepburn). Deterministic transliteration of
// the kana strings that ship with each card; no external lookups.
//
// Handles: hiragana + katakana basic gojuon, dakuten/handakuten, yoon
// digraphs (small ゃゅょ), sokuon (っ doubles next consonant; "tchi"
// before ち), katakana long-vowel mark ー, syllabic ん (apostrophe
// before vowels/y, "m" before m/b/p), and the okurigana-boundary dot
// used in card kun readings (ひと.つ → hito·tsu).

(function(){
  const HIRA_BASIC = {
    'あ':'a','い':'i','う':'u','え':'e','お':'o',
    'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
    'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
    'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
    'ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
    'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
    'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do',
    'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
    'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
    'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
    'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
    'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
    'や':'ya','ゆ':'yu','よ':'yo',
    'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
    'わ':'wa','ゐ':'wi','ゑ':'we','を':'wo',
    'ん':'n',
  };

  const HIRA_YOON = {
    'きゃ':'kya','きゅ':'kyu','きょ':'kyo',
    'ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
    'しゃ':'sha','しゅ':'shu','しょ':'sho',
    'じゃ':'ja','じゅ':'ju','じょ':'jo',
    'ちゃ':'cha','ちゅ':'chu','ちょ':'cho',
    'ぢゃ':'ja','ぢゅ':'ju','ぢょ':'jo',
    'にゃ':'nya','にゅ':'nyu','にょ':'nyo',
    'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo',
    'びゃ':'bya','びゅ':'byu','びょ':'byo',
    'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo',
    'みゃ':'mya','みゅ':'myu','みょ':'myo',
    'りゃ':'rya','りゅ':'ryu','りょ':'ryo',
  };

  // Katakana ァ–ヶ (U+30A1–U+30F6) → hiragana ぁ–ゖ (U+3041–U+3096)
  // is a flat -0x60 shift. ー and small ッ are handled by the tokenizer.
  function kataToHira(ch) {
    const code = ch.charCodeAt(0);
    if (code >= 0x30A1 && code <= 0x30F6) return String.fromCharCode(code - 0x60);
    return ch;
  }

  function lastVowel(s) {
    for (let i = s.length - 1; i >= 0; i--) {
      if ('aiueo'.indexOf(s[i]) !== -1) return s[i];
    }
    return '';
  }

  function nextRomaji(a, b) {
    const pair = (a || '') + (b || '');
    return HIRA_YOON[pair] || HIRA_BASIC[a] || '';
  }

  function toRomaji(input) {
    if (!input) return input;

    // Normalize katakana → hiragana so the lookup tables stay single-script.
    // ー (long-vowel mark) and ッ (small katakana tsu) are special: keep ー
    // verbatim for the long-vowel branch; fold ッ into っ so sokuon logic
    // doesn't need two cases.
    let s = '';
    for (const ch of input) {
      if (ch === 'ー') { s += ch; continue; }
      if (ch === 'ッ') { s += 'っ'; continue; }
      s += kataToHira(ch);
    }

    let out = '';
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      const nx = s[i + 1];

      if (ch === '.') { out += '·'; i++; continue; }

      if (ch === 'ー') {
        out += lastVowel(out);
        i++;
        continue;
      }

      if (ch === 'っ') {
        const rom = nextRomaji(nx, s[i + 2]);
        if (!rom) { i++; continue; }
        // ち-series: tch- in Hepburn (e.g. まっちゃ → matcha).
        if (rom.startsWith('ch')) out += 't';
        else out += rom[0];
        i++;
        continue;
      }

      if (HIRA_YOON[ch + (nx || '')]) {
        out += HIRA_YOON[ch + nx];
        i += 2;
        continue;
      }

      if (ch === 'ん') {
        const rom = nextRomaji(nx, s[i + 2]);
        const c0 = rom[0] || '';
        if (c0 === 'm' || c0 === 'b' || c0 === 'p') out += 'm';
        else if ('aiueoy'.indexOf(c0) !== -1) out += "n'";
        else out += 'n';
        i++;
        continue;
      }

      if (HIRA_BASIC[ch]) {
        out += HIRA_BASIC[ch];
        i++;
        continue;
      }

      // Anything else (punctuation, latin, unexpected) — pass through.
      out += ch;
      i++;
    }
    return out;
  }

  Object.assign(window, { Romaji: { toRomaji } });
})();
