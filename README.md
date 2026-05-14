# TaskMan V02

Offline-first task manager PWA built with Vite, React, TypeScript, Dexie, Tailwind CSS, and Workbox.

The app keeps its working data in the browser storage through IndexedDB. There is no backend or account system in the current version.

## Features

- Today workflow with task completion, overdue handling, XP, rewards, and task return counters.
- Projects, Progress, Calendar, Notes, Ledger, Daily Log, Settings, Shop, Skills, and Analytics pages.
- Local notifications/reminders and app badge support where the browser allows it.
- Import/export safety checks for backup restore flows.
- Multiple visual themes, including classic, handwritten, and HUD styles.
- Optional pet companion and experimental Tetris page behind feature flags.
- PWA build with service worker support.

## Stack

- Vite
- React 18
- TypeScript
- Tailwind CSS
- Dexie / IndexedDB
- Workbox via `vite-plugin-pwa`
- Vitest

## Requirements

- Node.js 20 or newer is recommended for Vite 7.
- npm

## Local Development

```bash
npm install
npm run dev
```

The dev server normally opens at:

```text
http://localhost:5173
```

Browser storage is local to the browser profile. If you open the app in a different browser profile, it will not share the same IndexedDB/localStorage data.

## Checks

```bash
npm run typecheck
npm run test:run
npm run build
```

`npm run build` runs `typecheck` first and then builds the Vite app into `dist/`.

## Deploy

Netlify is configured through `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

SPA fallback is enabled so app routes resolve to `index.html`.

## Repository Hygiene

Generated build output and local artifacts are ignored:

- `node_modules/`
- `dist/`
- `.env*`
- `.codex-snapshots/`
- `pet-runs/`

Keep real backup exports, test data dumps, and secrets out of the repo.
