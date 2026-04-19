# Kanji-buddy

Offline-first PWA for learning kanji through spaced repetition and
time-based challenge modes. Single-operator study tool with a
cyberpunk / terminal aesthetic.

## Modes

- **Run** — Daily SRS session (SM-2 scheduler) over a weighted deck of
  new, due, and leech cards.
- **Time Attack** — 30/60/120s tile-pick sprints against the clock.
- **Survival** — Single-life depth ladder with rising JLPT difficulty.
- **Streak Guard** — Rescue cards that are about to leak from streaks.
- **Leech Hunt** — Target and purge your worst-performing cards.
- **Match** — Pair kanji with meanings under the clock.

All modes feed one shared XP pool and rank ladder.

## Progression

12-rank operator ladder (NOVICE → ASCENDANT) with Japanese ceremonial
titles and a four-tier colour arc (cyan → magenta → amber → transcend).
Thresholds follow a gentle-to-steep curve from 150 XP (rank Ⅱ) to
55,000 XP (rank Ⅻ). Rank-up fires a one-time promotion ceremony on the
next Home load.

## Tech

- Zero build step — React 18 + Babel-standalone served as static files
- IndexedDB (`data/db.js`) for user profile, card states, sessions, scores
- Service worker for offline / stale-while-revalidate delivery
- SM-2 scheduler in `data/srs.js`
- Design tokens in `design_system/colors_and_type.css`
- Cards seeded from an Archive `.zip`, imported once and persisted in OPFS/IDB

## Run it locally

Any static file server works:

    python -m http.server 8000

Then open `http://localhost:8000/Home.html`.

## Layout

    Home.html, Run.html, TimeAttack.html, ...   # one HTML per mode
    components/                                  # React components (.jsx)
    data/                                        # db, srs, daily, rank, cards
    design_system/                               # shared tokens + assets
    *.css                                        # per-page styles
    sw.js                                        # PWA service worker
    tools/                                       # build helpers (icons, etc)

## Status

Personal project. Not accepting external PRs.
