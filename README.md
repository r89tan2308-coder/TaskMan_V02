# TaskMan PWA (MVP)

Клиентское offline‑first PWA без бэкенда и авторизации. Источник правды — локальный event ledger (Dexie/IndexedDB). Сервис‑воркер управляется Workbox через `vite-plugin-pwa`. UI — Tailwind.

## Стек
- Vite + React + TypeScript
- Tailwind CSS
- Dexie (IndexedDB)
- Workbox (через `vite-plugin-pwa`)

## Требования
- Node.js 18+
- npm

## Локальный запуск
```bash
npm install
npm run dev
```
Откройте адрес из консоли (`http://localhost:5173` по умолчанию).

## Сборка
```bash
npm run build
npm run preview
```

## Текущее состояние
- Базовый скелет PWA: React + Tailwind, регистрация service worker через `virtual:pwa-register`.
- Заготовка Dexie (`src/db/index.ts`) с таблицами tasks/ledger/rewards.
- Манифест PWA задаётся в `vite.config.ts`.

## Структура
```
src/
  App.tsx          # входной экран-заглушка
  main.tsx         # bootstrap + SW регистрация
  index.css        # Tailwind директивы и базовые стили
  db/              # Dexie schema
  pages|features|domain|services|i18n|service-worker|shared/  # зарезервировано под логику
```

## MVP ограничения (см. PAUSE_NOTES.md)
- Только client-only PWA; нет backend/auth/Clerk или других онлайн‑сервисов.
- Редкость -> XP per rarity; знак XP задаётся при логировании.
- Стрик с кастомным периодом; можно править прошлые логи с подтверждением.
- Один дедлайн и одно напоминание на задачу; экспорт .ics включает VALARM.
- Импорт/экспорт JSON: `schemaVersion`, `exportedAt` (ISO), опционально `appVersion`, `source="taskman-pwa"`, режим `replace`.
