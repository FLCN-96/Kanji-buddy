// Version handshake + "new version available" banner.
//
// Why this exists: iOS Safari (especially in standalone PWA mode) can
// pin stale source files in its HTTP / memory caches long after the
// service worker's stale-while-revalidate has quietly fetched fresh
// bytes, and there is no clean user-facing way to clear that state.
// The classic SW `updatefound` flow isn't reliable there either —
// Safari sometimes won't refetch sw.js for days.
//
// How the handshake works:
//   1. At deploy time, the CI workflow rewrites `SERVED_SHA` in this
//      file to the commit SHA that built the deploy, and writes the
//      same SHA to version.json at the site root.
//   2. Whatever version.js the browser ends up running — stale from
//      a pinned cache, or fresh from the network — carries the SHA
//      of the deploy *it* came from.
//   3. The runtime fetches ./version.json with cache-busting and
//      sw.js is configured to serve /version.json network-only, so
//      the fetched SHA is always "what the server currently says is
//      live."
//   4. If the served SHA (this file) != the live SHA (version.json),
//      this page is running stale code and we surface a banner the
//      user can tap to clear caches, unregister the SW, and hard
//      reload into the fresh build.
//
// Local dev: version.js ships with SERVED_SHA = 'dev' and no
// version.json is committed, so fetchVersion() 404s and the banner
// stays dormant. CI overwrites both in the deploy job.

(function() {
  // Rewritten by .github/workflows/main.yml on each deploy.
  const SERVED_SHA = 'dev';

  const VERSION_URL    = './version.json';
  const POLL_MS        = 5 * 60 * 1000;   // passive poll interval
  const VISIBILITY_MIN = 30 * 1000;       // min gap between focus-triggered checks
  const BANNER_ID      = 'kb-update-banner';

  let lastCheck = 0;
  let shown = false;
  let dismissedForSha = null; // silence the banner until a newer sha ships
  let refreshing = false;     // guard against double-fire of performRefresh

  // Pages where a silent auto-reload would yank the user out of mid-flow
  // work (active timers, in-progress quiz, partial answers). On these we
  // still surface the banner and let the user choose. Home / Settings /
  // root are passive and safe to refresh in place.
  const isModePage = () => {
    const p = window.location.pathname.toLowerCase();
    return /\/(run|timeattack|survival|streakguard|leechhunt|match)\.html$/.test(p);
  };

  const fetchVersion = async () => {
    // Double defence against stale responses: `cache: 'no-store'`
    // plus a unique query string. The SW has an explicit network-only
    // handler for this path, but belt-and-suspenders never hurts.
    const url = `${VERSION_URL}?t=${Date.now()}`;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || typeof j.sha !== 'string') return null;
      return j;
    } catch { return null; }
  };

  const performRefresh = async (remote) => {
    if (refreshing) return;
    refreshing = true;
    const banner = document.getElementById(BANNER_ID);
    if (banner) {
      banner.classList.add('is-firing');
      const sub = banner.querySelector('.kb-upd-sub');
      if (sub) sub.textContent = 'clearing caches · fetching fresh code...';
      const btn = banner.querySelector('.kb-upd-btn');
      if (btn) btn.disabled = true;
    }

    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister().catch(() => {})));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
      }
    } catch {}

    const u = new URL(window.location.href);
    u.searchParams.set('upd', remote && remote.sha ? remote.sha.slice(0, 7) : String(Date.now()));
    window.location.replace(u.toString());
  };

  const showBanner = (remote) => {
    if (shown) return;
    if (remote && remote.sha && dismissedForSha === remote.sha) return;
    shown = true;

    const el = document.createElement('div');
    el.id = BANNER_ID;
    el.setAttribute('role', 'alert');
    el.innerHTML =
      '<button class="kb-upd-btn" type="button" aria-label="reload to load new version">' +
        '<span class="kb-upd-pulse" aria-hidden="true"></span>' +
        '<span class="kb-upd-txt">' +
          '<span class="kb-upd-lbl">\u25B8 NEW VERSION READY</span>' +
          '<span class="kb-upd-sub">mid-session \u00B7 tap to reload now \u00B7 progress is safe</span>' +
        '</span>' +
        '<span class="kb-upd-arrow" aria-hidden="true">\u27F3</span>' +
      '</button>' +
      '<button class="kb-upd-dismiss" type="button" aria-label="dismiss">\u2715</button>';
    document.body.appendChild(el);

    el.querySelector('.kb-upd-btn').addEventListener('click', () => performRefresh(remote));
    el.querySelector('.kb-upd-dismiss').addEventListener('click', () => {
      if (remote && remote.sha) dismissedForSha = remote.sha;
      shown = false;
      el.remove();
    });
  };

  // Single funnel for both signal sources (version.json poll + SW
   // updatefound). Decides between auto-reload (passive pages) and
   // banner (mid-session pages).
  const handleMismatch = (remote) => {
    if (refreshing) return;
    if (isModePage()) {
      showBanner(remote);
    } else {
      performRefresh(remote);
    }
  };

  const check = async () => {
    lastCheck = Date.now();
    if (SERVED_SHA === 'dev') return; // local dev — no handshake
    const remote = await fetchVersion();
    if (!remote) return;
    if (remote.sha !== SERVED_SHA) handleMismatch(remote);
  };

  // Brief celebratory overlay shown after a successful refresh — confirms
  // to the user that the page they're now looking at is the fresh build,
  // especially important when the reload happened silently from
  // pageshow / interval rather than a banner tap.
  const showUpgradeSuccess = () => {
    const el = document.createElement('div');
    el.id = 'kb-upd-success';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="kb-upd-success-card">' +
        '<svg class="kb-upd-success-glyph" viewBox="0 0 32 32" aria-hidden="true">' +
          '<circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".35"/>' +
          '<path d="M9 16.5 L14 21.5 L23 11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>' +
        '<div class="kb-upd-success-lbl">UPDATED</div>' +
      '</div>';
    document.body.appendChild(el);
    setTimeout(() => { el.classList.add('is-out'); }, 1200);
    setTimeout(() => { try { el.remove(); } catch {} }, 1700);
  };

  // If we just came back from a performRefresh() reload, the URL carries
  // ?upd=<sha7>. Strip it so a manual refresh doesn't replay the
  // celebration, then play the animation.
  const consumeUpdMarker = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (!params.has('upd')) return;
      params.delete('upd');
      const qs = params.toString();
      const clean = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
      history.replaceState(null, '', clean);
      // Defer one tick so styles are injected first (injectStyles runs
      // synchronously below, but the success card uses its own keyframes
      // and we want them parsed before the element appears).
      setTimeout(showUpgradeSuccess, 0);
    } catch {}
  };

  const injectStyles = () => {
    if (document.getElementById('kb-upd-styles')) return;
    const s = document.createElement('style');
    s.id = 'kb-upd-styles';
    s.textContent = [
      '#kb-update-banner{',
        'position:fixed;left:50%;',
        'bottom:calc(env(safe-area-inset-bottom,0px) + 12px);',
        'transform:translateX(-50%);z-index:9999;',
        'display:flex;align-items:stretch;gap:1px;',
        'background:#141c2b;border:1px solid #22d3ee;',
        'box-shadow:0 0 0 1px #0a0e14,0 0 24px rgba(34,211,238,.45),0 8px 24px rgba(0,0,0,.6);',
        "font-family:'JetBrains Mono',ui-monospace,Menlo,Monaco,Consolas,monospace;",
        'max-width:calc(100vw - 24px);',
        'animation:kb-upd-in 260ms cubic-bezier(.2,.8,.2,1);',
      '}',
      '@keyframes kb-upd-in{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}',
      '#kb-update-banner .kb-upd-btn{',
        'display:flex;align-items:center;gap:12px;padding:10px 14px;',
        'background:transparent;border:0;color:#e6edf3;cursor:pointer;',
        'font:inherit;text-align:left;transition:background 120ms cubic-bezier(.2,.8,.2,1);',
      '}',
      '@media (hover: hover){#kb-update-banner .kb-upd-btn:hover{background:rgba(34,211,238,.08)}}',
      '#kb-update-banner .kb-upd-btn:focus-visible{outline:1px dashed #22d3ee;outline-offset:-4px}',
      '#kb-update-banner .kb-upd-btn[disabled]{cursor:wait;opacity:.85}',
      '#kb-update-banner.is-firing .kb-upd-arrow{animation:kb-upd-spin 900ms linear infinite}',
      '#kb-update-banner .kb-upd-pulse{',
        'width:8px;height:8px;border-radius:50%;background:#22d3ee;',
        'box-shadow:0 0 8px #22d3ee,0 0 16px rgba(34,211,238,.6);',
        'animation:kb-upd-pulse 1.4s ease-in-out infinite;flex:0 0 auto;',
      '}',
      '@keyframes kb-upd-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.78)}}',
      '#kb-update-banner .kb-upd-txt{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '#kb-update-banner .kb-upd-lbl{',
        'font-size:11px;letter-spacing:.14em;text-transform:uppercase;',
        'color:#22d3ee;text-shadow:0 0 6px rgba(34,211,238,.55);font-weight:700;',
      '}',
      '#kb-update-banner .kb-upd-sub{font-size:10px;letter-spacing:.04em;color:#aab4c2}',
      '#kb-update-banner .kb-upd-arrow{',
        'font-size:16px;color:#22d3ee;text-shadow:0 0 6px rgba(34,211,238,.55);flex:0 0 auto;',
      '}',
      '@keyframes kb-upd-spin{to{transform:rotate(360deg)}}',
      '#kb-update-banner .kb-upd-dismiss{',
        'background:transparent;border:0;border-left:1px solid #1e2838;',
        'color:#6b7686;padding:0 12px;font:inherit;font-size:12px;cursor:pointer;',
        'transition:color 120ms,background 120ms;',
      '}',
      '@media (hover: hover){#kb-update-banner .kb-upd-dismiss:hover{color:#e6edf3;background:rgba(255,255,255,.04)}}',
      // Success celebration — center-screen card, neon checkmark, brief.
      '#kb-upd-success{',
        'position:fixed;inset:0;z-index:10000;pointer-events:none;',
        'display:flex;align-items:center;justify-content:center;',
        'animation:kb-suc-bg-in 180ms ease-out;',
      '}',
      '#kb-upd-success.is-out{animation:kb-suc-bg-out 480ms ease-in forwards}',
      '@keyframes kb-suc-bg-in{from{background:rgba(10,14,20,0)}to{background:rgba(10,14,20,.32)}}',
      '@keyframes kb-suc-bg-out{from{background:rgba(10,14,20,.32);opacity:1}to{background:rgba(10,14,20,0);opacity:0}}',
      '#kb-upd-success .kb-upd-success-card{',
        'position:relative;',
        'background:rgba(20,28,43,.92);',
        '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);',
        'border:1px solid #22d3ee;',
        'box-shadow:0 0 0 1px #0a0e14,0 0 48px rgba(34,211,238,.55),0 12px 48px rgba(0,0,0,.6);',
        'padding:22px 30px 18px;min-width:160px;',
        'display:flex;flex-direction:column;align-items:center;gap:10px;',
        "font-family:'JetBrains Mono',ui-monospace,Menlo,Monaco,Consolas,monospace;",
        'animation:kb-suc-pop 460ms cubic-bezier(.2,.9,.25,1.15);',
      '}',
      '#kb-upd-success.is-out .kb-upd-success-card{animation:kb-suc-pop-out 420ms cubic-bezier(.4,.0,.7,.2) forwards}',
      '@keyframes kb-suc-pop{',
        '0%{transform:scale(.6) translateY(8px);opacity:0;filter:blur(4px)}',
        '55%{transform:scale(1.06) translateY(0);opacity:1;filter:blur(0)}',
        '100%{transform:scale(1) translateY(0)}',
      '}',
      '@keyframes kb-suc-pop-out{',
        '0%{transform:scale(1);opacity:1}',
        '100%{transform:scale(.92) translateY(-6px);opacity:0}',
      '}',
      // Sweep — a thin neon line travels behind the card right after pop.
      '#kb-upd-success .kb-upd-success-card::after{',
        'content:"";position:absolute;inset:-1px;pointer-events:none;',
        'background:linear-gradient(115deg,transparent 35%,rgba(34,211,238,.45) 50%,transparent 65%);',
        'background-size:240% 100%;background-position:120% 0;',
        'mix-blend-mode:screen;',
        'animation:kb-suc-sweep 900ms cubic-bezier(.2,.8,.2,1) 220ms 1;',
      '}',
      '@keyframes kb-suc-sweep{from{background-position:120% 0}to{background-position:-40% 0}}',
      '#kb-upd-success .kb-upd-success-glyph{',
        'width:42px;height:42px;color:#22d3ee;',
        'filter:drop-shadow(0 0 10px rgba(34,211,238,.7));',
        'animation:kb-suc-glyph 760ms cubic-bezier(.2,.9,.25,1.15);',
      '}',
      '@keyframes kb-suc-glyph{',
        '0%{transform:scale(0) rotate(-25deg);opacity:0}',
        '60%{transform:scale(1.18) rotate(0);opacity:1}',
        '100%{transform:scale(1) rotate(0)}',
      '}',
      // Stroke draw on the checkmark path — uses dasharray morph so the
      // tick literally writes itself.
      '#kb-upd-success .kb-upd-success-glyph path{',
        'stroke-dasharray:30;stroke-dashoffset:30;',
        'animation:kb-suc-draw 520ms cubic-bezier(.2,.9,.2,1) 180ms forwards;',
      '}',
      '@keyframes kb-suc-draw{to{stroke-dashoffset:0}}',
      '#kb-upd-success .kb-upd-success-lbl{',
        'font-size:11px;letter-spacing:.28em;color:#22d3ee;',
        'text-shadow:0 0 8px rgba(34,211,238,.6);font-weight:700;',
        'animation:kb-suc-lbl 360ms cubic-bezier(.2,.8,.2,1) 280ms backwards;',
      '}',
      '@keyframes kb-suc-lbl{from{opacity:0;letter-spacing:.5em}to{opacity:1;letter-spacing:.28em}}',
      '@media (prefers-reduced-motion: reduce){',
        '#kb-update-banner,#kb-update-banner *,#kb-upd-success,#kb-upd-success *{animation:none!important;transition:none!important}',
      '}',
    ].join('');
    document.head.appendChild(s);
  };

  // Secondary trigger: if the SW lifecycle *does* detect an update on
  // this browser (desktop / Android do this reliably), surface the
  // banner from that signal too. Belt-and-suspenders with the
  // version.json poll — either one firing gets the user notified.
  const watchSW = async () => {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const maybeShow = () => {
        // We can't easily know the remote SHA from here, so pass null
        // and let performRefresh() use a timestamp cache-buster.
        // Route through handleMismatch so passive pages still auto-reload.
        handleMismatch(null);
      };
      if (reg.waiting && navigator.serviceWorker.controller) maybeShow();
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) maybeShow();
        });
      });
      try { reg.update(); } catch {}
    } catch {}
  };

  injectStyles();
  consumeUpdMarker();
  check();
  setInterval(check, POLL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastCheck < VISIBILITY_MIN) return;
    check();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
    }
  });

  // pageshow fires on iOS PWA bfcache restores even when visibilitychange
  // doesn't — this is the missing hook that made the handshake unreliable
  // when the home-screen app was reopened from background. event.persisted
  // is true for bfcache restores (so the in-page timers were frozen and
  // we definitely want to re-check); we still re-check on the initial
  // load case since it's cheap and avoids racing the boot check on slow
  // networks.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted || Date.now() - lastCheck >= VISIBILITY_MIN) {
      check();
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
    }
  });

  watchSW();

  window.KBVersion = {
    get served() { return SERVED_SHA; },
    check,
    refresh: performRefresh,
  };
})();
