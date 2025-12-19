# 🚀 Гайд по Деплою TaskMan

## Обзор архитектуры

```
Frontend (React + Vite) → Vercel
Backend (Express + Prisma) → Railway
Database → Railway PostgreSQL
Authentication → Clerk
```

---

## Шаг 1: Настройка Clerk (Аутентификация)

### 1.1 Создайте аккаунт Clerk

1. Перейдите на [clerk.com](https://clerk.com)
2. Зарегистрируйтесь через GitHub
3. Создайте новое приложение: "TaskMan RPG"

### 1.2 Получите ключи

1. В Dashboard Clerk → **API Keys**
2. Скопируйте:
   - **Publishable Key** (начинается с `pk_test_...`)
   - **Secret Key** (начинается с `sk_test_...`)

### 1.3 Обновите .env файлы

**Frontend** (`frontend/.env`):
```
VITE_API_URL=http://localhost:8000
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
```

**Backend** (`backend/.env`):
```
DATABASE_URL="postgresql://user:password@localhost:5432/taskman"
CLERK_SECRET_KEY=sk_test_your_key_here
CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
```

### 1.4 Настройте разрешенные методы входа

В Clerk Dashboard:
1. **User & Authentication** → **Email, Phone, Username**
2. Включите **Email** и **Google** (опционально)
3. Сохраните

---

## Шаг 2: Настройка Railway (Backend + Database)

### 2.1 Создайте аккаунт Railway

1. Перейдите на [railway.app](https://railway.app)
2. Зарегистрируйтесь через GitHub
3. Вы получите **$5 бесплатных кредитов** в месяц

### 2.2 Создайте проект

1. **New Project** → **Deploy PostgreSQL**
2. Дождитесь создания базы данных
3. Нажмите на PostgreSQL → **Variables** → скопируйте `DATABASE_URL`

### 2.3 Деплой Backend

1. **New** → **GitHub Repo** → выберите ваш репозиторий
2. **Settings** → **Root Directory** → укажите `backend`
3. **Variables** → добавьте:
   ```
   DATABASE_URL=<скопированный URL из PostgreSQL>
   CLERK_SECRET_KEY=sk_test_...
   CLERK_PUBLISHABLE_KEY=pk_test_...
   PORT=8000
   ```

4. **Settings** → **Networking** → **Generate Domain**
5. Скопируйте URL (например: `https://taskman-backend-production.up.railway.app`)

### 2.4 Запустите миграцию базы данных

В терминале на вашем компьютере:

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

**Или** через Railway CLI:
```bash
railway link
railway run npx prisma migrate deploy
```

---

## Шаг 3: Настройка Vercel (Frontend)

### 3.1 Создайте аккаунт Vercel

1. Перейдите на [vercel.com](https://vercel.com)
2. Зарегистрируйтесь через GitHub

### 3.2 Деплой Frontend

1. **Add New** → **Project**
2. **Import Git Repository** → выберите ваш репозиторий
3. **Root Directory** → выберите `frontend`
4. **Environment Variables** → добавьте:
   ```
   VITE_API_URL=https://taskman-backend-production.up.railway.app
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
   ```
5. **Deploy**

### 3.3 Получите URL

После деплоя Vercel выдаст URL типа:
```
https://taskman-rpg.vercel.app
```

---

## Шаг 4: Обновите Clerk Redirect URLs

1. Вернитесь в **Clerk Dashboard**
2. **Domains** → добавьте ваш Vercel URL
3. **Allowed redirect URLs** → добавьте:
   ```
   https://taskman-rpg.vercel.app
   https://taskman-rpg.vercel.app/*
   ```

---

## Шаг 5: Тестирование

1. Откройте ваш Vercel URL
2. Зарегистрируйтесь через Email или Google
3. Создайте тестовый квест
4. Проверьте, что все работает!

---

## 🔄 Автоматические Обновления

**Frontend (Vercel):**
- Автоматически деплоится при push в `main` ветку
- Превью-деплои для pull requests

**Backend (Railway):**
- Автоматически деплоится при push в `main` ветку
- Перезапускается при изменениях

---

## 💰 Стоимость

| Сервис | Лимит бесплатного тарифа |
|--------|--------------------------|
| **Vercel** | Безлимитный трафик, 100 GB bandwidth/месяц |
| **Railway** | $5 кредитов/месяц (~500 часов работы) |
| **Clerk** | 10,000 активных пользователей бесплатно |

**Итого:** Полностью бесплатно до 10,000 пользователей!

---

## 🛠️ Локальная Разработка с PostgreSQL

Если хотите локально тестировать с PostgreSQL:

### Вариант 1: Docker
```bash
docker run --name taskman-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres
```

### Вариант 2: Railway локально
В `.env`:
```
DATABASE_URL="<Railway DATABASE_URL>"
```

Затем:
```bash
cd backend
npm run dev
```

---

## 📝 Полезные Команды

### Backend
```bash
# Создать новую миграцию
npx prisma migrate dev --name your_migration_name

# Применить миграции
npx prisma migrate deploy

# Обновить Prisma Client
npx prisma generate

# Посмотреть базу данных
npx prisma studio
```

### Frontend
```bash
# Разработка
npm run dev

# Билд
npm run build

# Превью продакшн билда
npm run preview
```

---

## 🐛 Troubleshooting

### Backend не запускается на Railway
- Проверьте, что `DATABASE_URL` правильный
- Убедитесь, что миграции применены
- Проверьте логи: Railway Dashboard → вашsevice → **Logs**

### Frontend не может подключиться к Backend
- Проверьте `VITE_API_URL` в Vercel
- Убедитесь, что CORS настроен правильно в backend
- Проверьте, что Railway сервис запущен

### Clerk ошибки
- Проверьте, что Publishable Key правильный
- Убедитесь, что redirect URLs добавлены в Clerk
- Проверьте, что домен разрешен в Clerk

---

## 🎯 Следующие Шаги

1. ✅ Настроить кастомный домен в Vercel
2. ✅ Добавить Google Analytics
3. ✅ Настроить email уведомления через Clerk
4. ✅ Добавить мониторинг (Sentry, LogRocket)
5. ✅ Оптимизировать базу данных (индексы)

---

## 📚 Дополнительные Ресурсы

- [Vercel Docs](https://vercel.com/docs)
- [Railway Docs](https://docs.railway.app)
- [Clerk Docs](https://clerk.com/docs)
- [Prisma Docs](https://www.prisma.io/docs)