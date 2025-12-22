# Pause Notes

Last updated: 2025-12-17

Agreed MVP (client-only offline PWA):
- No backend, no auth, no paid services.
- IndexedDB via Dexie; Workbox service worker.
- Event ledger is the source of truth for XP; XP balance and streak derived.
- Features in scope: tasks (rarity + XP), daily log (from tasks only), streak, rewards shop, ledger, export/import (JSON, replace mode).
- Required: Today/Overdue screen; in-app reminders; .ics export for tasks with deadlines/reminders.
- Optional bonus: Android-only notifications if low complexity.
- Phase 2: accounts, sync, push, cloud (TBD).

Architecture/structure already proposed (no code yet):
- Client-only PWA; offline-first; RU default, EN available.
- Proposed structure: app/pages/features/domain/db/services/i18n/service-worker/shared.

Open questions to answer before skeleton:
1) Rarity levels and XP scheme (fixed per rarity vs per-task values).
2) Negative actions: separate tasks with negative XP vs sign at log time.
3) Streak: allowed periods (daily/weekly/custom) and pass rule (min 1 per period vs N per period).
4) Deadlines/reminders: single vs multiple; time-of-day support; local timezone assumption.
5) Ledger edit policy: allow edit/delete past logs or only compensating events.
6) Rewards: required fields (cost, repeatable, cooldown) and purchase effect.
7) Screen list confirmation (Today/Overdue, Tasks, Daily Log, Rewards, Ledger, Settings, etc.).
8) .ics export: deadlines only or include VALARM reminders.
9) Import/export metadata: include schemaVersion and exportedAt.
10) UI styling preference (CSS Modules/Tailwind/styled/vanilla CSS).

Next step: once questions are answered, create project skeleton (no feature code yet).

---

Progress 2025-12-18:
- Skeleton ready: Vite+React+TS, Tailwind, Dexie, Workbox (PWA), basic logic layer.
- Domain types added for tasks/ledger/streak/rewards/dailyLog/calendar/app.
- DB layer: Dexie schema + repos (tasks, ledger, export/import).
- Logic layer: XP per rarity with override, deterministic ledger math, streak calc (daily/weekly/custom, local time, task-only).
- Services: tasks (create, complete/undo -> ledger events), xp balance, streak.
- UI: Today page (XP balance, streak current/best, task list with filter daily/one-time, add-task modal with title/rarity/periodicity, complete button).

Progress 2025-12-19:
- Navigation added in App.tsx (Today/Ledger/Log/Shop/Settings simple buttons).
- New pages: Ledger (loads ledger events, newest first, shows time/kind/refId/xp with empty state), Shop (loads rewards or mock seed, shows cost, Buy creates reward ledger event with negative XP and disables when insufficient XP), Daily Log/Settings placeholders.
- Types/utility: added vite-env reference for PWA virtual module; Dexie transaction call fixed to array form.

Next steps (agreed to do next):
- Continue UI/feature work after review: e.g., daily log view, ledger view, rewards shop, export/import UI, .ics export, reminders.
