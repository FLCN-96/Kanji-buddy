// Audio pipeline — exposed as window.AudioManager.
//
// Mirrors the window.DB / window.Rank singleton style: a single IIFE that
// attaches one frozen-ish object to window. No imports, no build step —
// references the browser WebAudio API directly.
//
// Design constraints (locked product decisions):
//   • Audio is ON by default (mode 'full').
//   • UI SFX play everywhere.
//   • The chiptune BED plays ONLY in bounded/timed game modes
//     (time, survival, streak, leech, match, decipher) — NEVER on home,
//     run, or mastery. setBedForMode() enforces this whitelist.
//   • iOS: the AudioContext MUST be created lazily INSIDE a user gesture, or
//     iOS pins it 'suspended' forever. init() arms a one-shot pointerdown/
//     keydown listener; unlock() does the actual ctx creation + resume +
//     silent-buffer kick. Nothing touches WebAudio before that gesture.
//
// Persistence: settings live on localStorage 'kb-tweaks' (shared with the
// rest of the app's tweaks blob) under `.sound` ('off'|'sfx'|'full', default
// 'full') and `.volume` (0..1, default 0.8). We only ever read/merge that key
// so we don't clobber other tweaks.

(function () {
  'use strict';

  var TWEAKS_KEY = 'kb-tweaks';
  var DEFAULT_MODE = 'full';
  var DEFAULT_VOLUME = 0.8;
  var FORMATS = ['ogg', 'm4a', 'wav']; // probe order; .wav is the always-present fallback

  // Modes that get the background bed. Everything else (home/run/mastery/
  // settings/diagnostics/dictionary) is SFX-only.
  var BED_MODES = {
    time: true, survival: true, streak: true,
    leech: true, match: true, decipher: true,
  };
  var DEFAULT_BED = 'amb_challenge';

  // ── internal state ──────────────────────────────────────────────────
  var _ctx = null;
  var _master = null;       // GainNode -> destination
  var _sfxGain = null;      // GainNode -> master
  var _ambGain = null;      // GainNode -> master
  var _inited = false;      // init() armed the gesture listeners
  var _unlocked = false;    // unlock() ran inside a gesture
  var _muted = false;
  var _mode = DEFAULT_MODE;
  var _volume = DEFAULT_VOLUME;

  var _buffers = {};        // name -> AudioBuffer (decoded, memoized)
  var _loading = {};        // name -> Promise<AudioBuffer|null> (in-flight)
  var _missing = {};        // name -> true once all formats 404'd

  var _bed = null;          // { name, source, gain } currently-playing bed
  var _bedWanted = null;    // last name requested via playBed/setBedForMode

  // ── tweaks persistence ──────────────────────────────────────────────

  function _readTweaks() {
    try { return JSON.parse(localStorage.getItem(TWEAKS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }

  function _writeTweaks(patch) {
    try {
      var cur = _readTweaks();
      var next = Object.assign({}, cur, patch);
      localStorage.setItem(TWEAKS_KEY, JSON.stringify(next));
    } catch (e) { /* private mode / quota — non-fatal, runtime state still holds */ }
  }

  function _loadPrefs() {
    var t = _readTweaks();
    if (t.sound === 'off' || t.sound === 'sfx' || t.sound === 'full') _mode = t.sound;
    if (typeof t.volume === 'number' && t.volume >= 0 && t.volume <= 1) _volume = t.volume;
  }

  // ── gain graph ──────────────────────────────────────────────────────
  //
  //   sfxGain ┐
  //           ├─> masterGain ─> destination
  //   ambGain ┘
  //
  // masterGain carries volume*muted; sfx/amb gains are unity trims we can use
  // later for independent ducking. Only built once, inside unlock().

  function _buildGraph() {
    _master = _ctx.createGain();
    _sfxGain = _ctx.createGain();
    _ambGain = _ctx.createGain();
    _sfxGain.gain.value = 1.0;
    _ambGain.gain.value = 0.65;   // bed sits under SFX by default
    _sfxGain.connect(_master);
    _ambGain.connect(_master);
    _master.connect(_ctx.destination);
    _applyMasterGain();
  }

  function _applyMasterGain() {
    if (!_master) return;
    var g = (_muted || _mode === 'off') ? 0 : _volume;
    try {
      // setTargetAtTime gives a tiny ramp so volume/mute changes don't click.
      _master.gain.setTargetAtTime(g, _ctx.currentTime, 0.015);
    } catch (e) {
      _master.gain.value = g;
    }
  }

  // ── unlock / lifecycle ──────────────────────────────────────────────

  function unlock() {
    if (_unlocked && _ctx) {
      // Already have a context — just make sure it's running.
      if (_ctx.state === 'suspended') { try { _ctx.resume(); } catch (e) {} }
      return;
    }
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return; // no WebAudio — degrade to silent no-op everywhere.
    try {
      _ctx = new Ctx();
      _buildGraph();
      // Kick the context awake from inside the gesture.
      if (_ctx.state === 'suspended') { try { _ctx.resume(); } catch (e) {} }
      // Play one silent sample — the canonical iOS unlock nudge.
      var buf = _ctx.createBuffer(1, 1, _ctx.sampleRate);
      var src = _ctx.createBufferSource();
      src.buffer = buf;
      src.connect(_ctx.destination);
      try { src.start(0); } catch (e) {}
      _unlocked = true;
      // If a bed was requested before we were unlocked, start it now.
      if (_bedWanted) { var w = _bedWanted; _bedWanted = null; playBed(w); }
    } catch (e) {
      _ctx = null;
      _unlocked = false;
    }
  }

  var _onFirstGesture = function () {
    unlock();
    // Listeners are {once:true} so they self-remove, but guard anyway.
    window.removeEventListener('pointerdown', _onFirstGesture, true);
    window.removeEventListener('keydown', _onFirstGesture, true);
  };

  function init() {
    if (_inited) return;
    _inited = true;
    _loadPrefs();
    // Arm a one-time unlock on the first user gesture. {once} + capture so we
    // win the race regardless of where the app stops propagation. passive so
    // we never block scrolling/typing.
    var opts = { once: true, passive: true, capture: true };
    try {
      window.addEventListener('pointerdown', _onFirstGesture, opts);
      window.addEventListener('keydown', _onFirstGesture, opts);
    } catch (e) {
      // Older browsers: fall back to a plain boolean-capture add.
      window.addEventListener('pointerdown', _onFirstGesture, true);
      window.addEventListener('keydown', _onFirstGesture, true);
    }
    // Resume on tab return. Self-attached (idempotent — init() is guarded), so
    // the app doesn't have to wire this. The app MAY also call resume()
    // directly; both are safe.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') resume();
    });
    window.addEventListener('focus', resume);
  }

  function isUnlocked() { return _unlocked && !!_ctx; }

  function suspend() {
    if (_ctx && _ctx.state === 'running') { try { _ctx.suspend(); } catch (e) {} }
  }

  function resume() {
    if (_ctx && _ctx.state === 'suspended') { try { _ctx.resume(); } catch (e) {} }
  }

  // ── settings ────────────────────────────────────────────────────────

  function setVolume(v) {
    v = Math.max(0, Math.min(1, Number(v)));
    if (isNaN(v)) v = DEFAULT_VOLUME;
    _volume = v;
    _writeTweaks({ volume: v });
    _applyMasterGain();
  }
  function getVolume() { return _volume; }

  function setMuted(b) {
    _muted = !!b;
    _applyMasterGain();
    if (_muted) stopBed(150);
  }
  function isMuted() { return _muted; }

  function setMode(m) {
    if (m !== 'off' && m !== 'sfx' && m !== 'full') return;
    _mode = m;
    _writeTweaks({ sound: m });
    _applyMasterGain();
    // Leaving 'full' kills any running bed; 'off' silences everything.
    if (m !== 'full') stopBed(200);
    else if (_bedWanted) playBed(_bedWanted);
  }
  function getMode() { return _mode; }

  function isLowPower() {
    try {
      return !!(window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  // ── asset loading (lazy, memoized, format-probing) ──────────────────
  //
  // Resolve ./audio/<name>.{ogg,m4a,wav} in order. All same-origin so sw.js
  // caches them. We fetch the bytes and decodeAudioData; if a format 404s
  // (or decode throws), fall through to the next. Memoize the decoded buffer.

  function _decode(arrayBuf) {
    return new Promise(function (resolve, reject) {
      // Safari historically only supports the callback form of decodeAudioData.
      var p;
      try { p = _ctx.decodeAudioData(arrayBuf, resolve, reject); } catch (e) { reject(e); return; }
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
  }

  function _loadBuffer(name) {
    if (_buffers[name]) return Promise.resolve(_buffers[name]);
    if (_missing[name]) return Promise.resolve(null);
    if (_loading[name]) return _loading[name];
    if (!_ctx) return Promise.resolve(null);

    var i = 0;
    var attempt = function () {
      if (i >= FORMATS.length) { _missing[name] = true; return null; }
      var url = './audio/' + name + '.' + FORMATS[i++];
      return fetch(url, { credentials: 'same-origin' })
        .then(function (res) {
          if (!res.ok) return attempt();          // 404 etc -> next format
          return res.arrayBuffer()
            .then(function (ab) { return _decode(ab); })
            .then(function (buf) { _buffers[name] = buf; return buf; })
            .catch(function () { return attempt(); }); // decode failed -> next
        })
        .catch(function () { return attempt(); });    // network error -> next
    };

    var pr = Promise.resolve().then(attempt).then(function (buf) {
      delete _loading[name];
      return buf || null;
    });
    _loading[name] = pr;
    return pr;
  }

  // ── playback ────────────────────────────────────────────────────────

  function _silent() { return _mode === 'off' || _muted; }

  // play(name, opts) — fire-and-forget one-shot. opts:
  //   volume  0..1 trim relative to sfx bus (default 1)
  //   rate    playbackRate (default 1)
  //   when    ctx-time offset in seconds from now (default 0)
  function play(name, opts) {
    if (_silent() || !name) return;
    if (!_ctx) return;             // not unlocked yet — silently drop
    opts = opts || {};
    _loadBuffer(name).then(function (buf) {
      if (!buf || _silent() || !_ctx) return;
      var src = _ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opts.rate || 1;
      var node = _sfxGain;
      if (typeof opts.volume === 'number') {
        var g = _ctx.createGain();
        g.gain.value = Math.max(0, Math.min(1, opts.volume));
        g.connect(_sfxGain);
        node = g;
      }
      src.connect(node);
      try { src.start(_ctx.currentTime + (opts.when || 0)); } catch (e) {}
    });
  }

  // ── convenience SFX ─────────────────────────────────────────────────
  function tick()  { play('sfx_tick',  { volume: 0.7 }); }
  function correct() { play('sfx_correct'); }
  function wrong() { play('sfx_wrong'); }
  function nav()   { play('sfx_nav',   { volume: 0.8 }); }
  function rankUp() { play('sfx_rankup'); }
  function hot(tier) {
    // gold = full punch, silver = slightly softer + a hair lower.
    if (tier === 'silver') play('sfx_hot', { volume: 0.8, rate: 0.96 });
    else play('sfx_hot');
  }
  function milestone() { play('sfx_milestone'); }

  // ── background bed ──────────────────────────────────────────────────
  //
  // Beds only ever run in 'full' mode and never under reduced-motion. They
  // loop seamlessly (the WAVs are built with a wrap crossfade). Starting the
  // same bed that's already playing is a no-op (avoids restart pops).

  function playBed(name, opts) {
    name = name || DEFAULT_BED;
    _bedWanted = name;
    if (_mode !== 'full' || _muted || isLowPower()) return;
    if (!_ctx || !_unlocked) return;          // will retry from unlock()
    if (_bed && _bed.name === name) return;   // already playing this bed
    if (_bed) stopBed(120);                   // crossover from a different bed
    opts = opts || {};

    _loadBuffer(name).then(function (buf) {
      if (!buf) return;
      // Re-check guards — mode/visibility may have changed during decode.
      if (_mode !== 'full' || _muted || isLowPower() || !_ctx) return;
      if (_bed && _bed.name === name) return;
      var src = _ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      var g = _ctx.createGain();
      var target = (typeof opts.volume === 'number') ? opts.volume : 1.0;
      g.gain.value = 0.0001;
      g.connect(_ambGain);
      src.connect(g);
      try { src.start(0); } catch (e) {}
      // Fade in so it eases under the action.
      var fade = (opts.fadeMs != null ? opts.fadeMs : 350) / 1000;
      try { g.gain.setTargetAtTime(target, _ctx.currentTime, fade / 3); }
      catch (e) { g.gain.value = target; }
      _bed = { name: name, source: src, gain: g };
    });
  }

  function stopBed(fadeMs) {
    if (!_bed) return;
    var b = _bed;
    _bed = null;
    fadeMs = (fadeMs == null) ? 400 : fadeMs;
    if (!_ctx) { try { b.source.stop(); } catch (e) {} return; }
    var now = _ctx.currentTime;
    var fade = fadeMs / 1000;
    try {
      b.gain.gain.setTargetAtTime(0.0001, now, Math.max(0.02, fade / 3));
    } catch (e) {
      try { b.gain.gain.value = 0; } catch (e2) {}
    }
    // Stop the source after the fade so we free the node.
    setTimeout(function () {
      try { b.source.stop(); } catch (e) {}
      try { b.source.disconnect(); } catch (e) {}
      try { b.gain.disconnect(); } catch (e) {}
    }, fadeMs + 60);
  }

  // setBedForMode(modeId) — the one call modes use. Starts amb_challenge for
  // bounded/timed modes, stops the bed for everything else. Pass the mode id
  // strings the app already uses ('time','survival','streak','leech','match',
  // 'decipher','run','home','mastery',…).
  function setBedForMode(modeId) {
    if (modeId && BED_MODES[modeId]) playBed(DEFAULT_BED);
    else stopBed();
  }

  // ── diagnostics introspection ───────────────────────────────────────
  function _state() { return _ctx ? _ctx.state : 'none'; }
  function _loaded() { return Object.keys(_buffers); }

  // ── export ──────────────────────────────────────────────────────────
  window.AudioManager = {
    // lifecycle
    init: init,
    unlock: unlock,
    isUnlocked: isUnlocked,
    suspend: suspend,
    resume: resume,
    // settings
    setVolume: setVolume, getVolume: getVolume,
    setMuted: setMuted, isMuted: isMuted,
    setMode: setMode, getMode: getMode,
    isLowPower: isLowPower,
    // playback
    play: play,
    tick: tick, correct: correct, wrong: wrong, nav: nav,
    rankUp: rankUp, hot: hot, milestone: milestone,
    // beds
    playBed: playBed, stopBed: stopBed, setBedForMode: setBedForMode,
    // diagnostics
    get _ctx() { return _ctx; },
    _state: _state,
    _loaded: _loaded,
    // expose the bed-mode whitelist so Diagnostics can render it
    BED_MODES: BED_MODES,
  };
})();
