# REBUILT Arena

A fan-made, browser-first FRC **REBUILT 2026** simulator. Multiplayer-first rooms, a deterministic
match engine, a light 3D field, a full Section 7 rule model, custom robots and an offline solo mode.

No install for players: send one link and up to six drivers, a head referee and spectators join the
same room.

## Highlights

- **Closest-first multiplayer** — create a room, copy the five-character code or invite link, fill
  three red and three blue seats. Empty seats are held by AI so a match can always start.
- **Roles** — driver, human player, head referee and spectator. The server decides authority; the
  browser only sends inputs.
- **Full match flow** — 3s countdown, 20s AUTO, 10s TRANSITION, four 25s HUB shifts, 30s END GAME,
  scoring, cards, penalties, results, rematch.
- **Section 7 rule engine** — physics events and rule violations are separate. Pinning counts in
  three-second increments against a 3.0s limit, over-expansion is checked against the frame
  perimeter, AUTO contact across the center line, TOWER protection, human reach (G101) and more.
- **Referee dashboard** — call fouls by rule ID, issue yellow/red cards, force RP ineligibility,
  pause/resume, disable or reset a robot, adjust a score, confirm or overturn automatic calls, or
  drop into override mode when the engine should queue reviews instead of enforcing.
- **Bot Lab** — component rack with drag-to-install parts, live turntable preview, chassis numbers,
  drivetrain/intake/shooter/climber tuning, skin editor and JSON import/export. Six preset bots and
  unlimited custom builds.
- **Field Lab** — top-down editor with snap-to-grid placement for HUBs, TOWERs, OUTPOSTs, FUEL
  spawns, rails and starting positions. Every field is JSON and can be played in solo or rooms.
  The default arena is a 28 m × 14 m playfield: real-size robots, HUBs and TOWERs on an expanded
  carpet, so there is room to drive instead of a cramped 54 ft box.
- **Solo offline** — the same deterministic simulation runs in the browser. After the first load the
  PWA service worker keeps the shell and assets available with no connection.
- **Touch + keyboard** — on-screen joystick, rotate pad and one-tap mechanisms; WASD, Q/E, Space,
  F, C, X, G on desktop. Dark and light themes.

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 19 + TypeScript + Vite 7, React Router |
| 3D | Three.js (field, robots, Bot Lab turntable) |
| Simulation | Shared TypeScript engine (`packages/shared`), fixed 30 Hz step |
| Realtime | `ws` WebSocket server, authoritative rooms at 30 Hz / 15 Hz snapshots |
| HTTP | Express 5 |
| Storage | SQLite via `node:sqlite` (`data/rebuilt.db`), plus localStorage for offline play |
| PWA | Web manifest + service worker in `apps/web/public` |

## Repository layout

```
apps/
  web/                 React client (pages, match UI, 3D renderer, PWA)
  server/              Express API, WebSocket rooms, SQLite store
packages/
  shared/              Types, rule catalog + engine, simulation, bot parts, field model
scripts/dev.mjs        Runs API and Vite together
```

Key shared modules:

- `packages/shared/src/rules/catalog.ts` — rule metadata (penalty, detection mode, card)
- `packages/shared/src/rules/engine.ts` — automatic detection, pinning, cards, reviews
- `packages/shared/src/sim/engine.ts` — deterministic match simulation
- `packages/shared/src/bots/parts.ts` — component catalog and limits
- `packages/shared/src/games/rebuilt2026.ts` — season constants (timing, scoring, RP, limits)

## Requirements

- **Node.js 22.5+** (the server uses the built-in `node:sqlite` module) and npm 10+.
- A current Chrome, Edge, Firefox or Safari with WebGL for the 3D field.

## Run locally

```bash
npm install
npm run dev
```

- Web app: **http://localhost:3000**
- Room/API server: **http://localhost:8787** (`/api/health`, WebSocket at `/ws`)

The dev script runs both processes and prefixes their logs. Individual services:

```bash
npm run dev:web       # Vite only
npm run dev:server    # API + rooms only
```

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | API/WebSocket port |
| `DATABASE_PATH` | `data/rebuilt.db` | SQLite file |
| `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` | — | Extra Vite hostnames (preview domains) |

No account is required. The client creates an anonymous driver identity per browser and sends it as
`x-user-id`; custom bots and fields are also cached locally so they survive an offline session and
sync when the server is reachable.

## Production build

```bash
npm run build     # typecheck + Vite build + server typecheck
npm start         # Express serves the built web app and API on PORT
```

`npm start` serves `apps/web/dist` alongside `/api` and `/ws`, so a single Node process can host a
complete instance. Put it behind a reverse proxy that forwards WebSocket upgrades for `/ws`, and set
`DATABASE_PATH` to a persistent volume.

### Deploy notes

- The server is stateful: persistent disk for SQLite, and one process per instance (rooms are
  in-memory and rehydrated lazily; no horizontal room sharing yet).
- HTTPS is required for PWA installation and service-worker caching.
- The front end is a standard static build; set `VITE_*` variables only if you add a custom API
  origin (the default is same-origin).
- Health check: `GET /api/health` returns `{ ok, rooms, rulesVersion }`.

## Hosting the web app on GitHub Pages

`.github/workflows/deploy-pages.yml` builds the Vite client and publishes it to GitHub Pages on
every push to `main`:

**https://jameswellsw.github.io/rebuild2/**

The deploy job enables Pages with `build_type: workflow` when it is not configured yet, so a push
to `main` is all it takes — provided the repository is public, because Pages on **private**
repositories needs a paid plan. If the token cannot enable Pages, the job stops with an annotation
pointing at **Settings → Pages → Build and deployment → Source: GitHub Actions** rather than failing
silently; flip it and re-run the workflow.

```bash
VITE_BASE=/rebuild2/ npm run build -w @rebuilt/web   # what CI runs
```

`VITE_BASE` is the subpath the site is served from; the router basename, service worker scope and
PWA manifest all derive from it, so the same build works at the domain root or under `/<repo>/`.
A copy of `index.html` is published as `404.html` so deep links such as `/rebuild2/solo` resolve.

GitHub Pages is static, so the hosted build runs the browser-side engine: solo matches, Bot Lab,
Field Lab, the rulebook and local match history all work. **Rooms need the Node server** — run it
locally or on any always-on host as described above — the Pages build shows `Offline solo mode
ready` and room creation is unavailable there.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Translate | `W A S D` / arrows | left joystick |
| Rotate | `Q` / `E` | rotate buttons |
| Shoot FUEL | `Space` | SHOOT (hold) |
| Intake | `F` | INTAKE toggle |
| Extend arm | `X` | EXTEND toggle |
| Climb TOWER | `C` | CLIMB (hold) |
| Drop FUEL | `G` | DROP |
| Cameras | on-screen switcher | switcher |

## Rules implemented

Timing, scoring, ranking points and limits all come from `REBUILT_2026` and are data-driven so a
Team Update can change numbers without touching the physics.

- **Match:** 2:40 total — AUTO 20s, TRANSITION 10s, four 25s shifts, END GAME 30s. FUEL: 1 point in
  an active HUB. AUTO TOWER L1: 15. END GAME TOWER: 10 / 20 / 30.
- **Ranking points:** ENERGIZED (100 FUEL), SUPERCHARGED (360 FUEL), TRAVERSAL (50 TOWER points),
  win 3 RP, tie 1 RP. Fouls award match points only.
- **Penalties:** minor foul +5, major foul +15; warnings are logged with no points. Two yellows
  become a red card; a red card disqualifies the alliance (0 match points, no RPs).
- **Pinning (G418):** 3.0s limit counted in 3s increments; reset requires 1.83 m of separation held
  for 3s.
- **Expansion (G413):** 0.305 m beyond the frame, 0.762 m height limit, 2.794 m perimeter.
- **Catalog:** G101, G211, G403, G404, G405, G408, G413, G415, G416, G417, G418, G419, G420, G421,
  G423, G424, G425, G427, R105, R107. Each entry carries the penalty, detection mode (automatic,
  review, referee-only) and a plain-language summary.

The official REBUILT 2026 game manual and Team Updates always take precedence; the Rules page links
to the source and states the implemented snapshot.

## API quick reference

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Service status |
| `GET /api/game` | Season constants |
| `GET /api/bots?userId=` | Bots for a driver (presets + custom) |
| `POST /api/bots`, `PUT /api/bots/:id`, `DELETE /api/bots/:id` | Manage custom bots |
| `GET /api/fields`, `POST /api/fields` | List/save field layouts |
| `POST /api/rooms` | Create a room (`name`, `playerName`, `mode`) |
| `GET /api/rooms/:code` | Room snapshot |
| `GET /api/matches`, `GET /api/matches/:id` | Match history and full log |
| `WS /ws` | Room join, roster, inputs, referee commands, chat, snapshots |

## Tests and checks

```bash
npm run typecheck   # shared, server, web
npm test            # simulation + rule engine + server integration
npm run build       # production build
```

The server integration suite covers room creation, two drivers joining, starting an authoritative
match, a referee foul call, the persisted result and the custom bot/field endpoints.

## Scope

This is an unofficial fan project, not affiliated with or endorsed by FIRST. It is a simulator, not
a replacement for the official field, FMS or judging process. Rules and numbers are versioned; when
the manual and this project disagree, the manual wins.

Built with React, Three.js and a shared deterministic TypeScript core. Have fun, keep your hands
outside the field.
