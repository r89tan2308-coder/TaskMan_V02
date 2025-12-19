# ⚡ Быстрый Старт - TaskMan RPG

## 📋 Что нужно сделать:

### 1. Получите ключи Clerk (5 минут)

1. Зайдите на https://clerk.com и зарегистрируйтесь
2. Создайте приложение "TaskMan RPG"
3. Скопируйте ключи из раздела **API Keys**:
   - Publishable Key (pk_test_...)
   - Secret Key (sk_test_...)

### 2. Настройте Backend

```bash
cd backend
npm install
cp .env.example .env
```

Отредактируйте `.env`:
```env
DATABASE_URL="postgresql://..."  # Или используйте SQLite для теста
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
```

Примените миграции:
```bash
npx prisma migrate dev
npm run dev
```

Backend запущен на `http://localhost:8000` ✅

### 3. Настройте Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

Отредактируйте `.env`:
```env
VITE_API_URL=http://localhost:8000
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Запустите:
```bash
npm run dev
```

Frontend запущен на `http://localhost:5173` ✅

### 4. Готово!

Откройте http://localhost:5173 и зарегистрируйтесь!

---

## 🐳 Быстрый старт с Docker (PostgreSQL)

Если не хотите устанавливать PostgreSQL:

```bash
# Запустите PostgreSQL в Docker
docker run --name taskman-postgres \
  -e POSTGRES_USER=taskman \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=taskman \
  -p 5432:5432 \
  -d postgres

# В backend/.env укажите:
DATABASE_URL="postgresql://taskman:password@localhost:5432/taskman?schema=public"
```

---

## 🚀 Деплой в Production

**Для полного продакшн деплоя смотрите [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)**

Краткая версия:
1. **Backend** → Railway (автодеплой из GitHub)
2. **Frontend** → Vercel (автодеплой из GitHub)
3. Обновите Clerk Redirect URLs
4. Готово! 🎉

---

## ❓ Проблемы?

### Backend не запускается
- Проверьте `DATABASE_URL` в `.env`
- Убедитесь, что PostgreSQL запущен
- Попробуйте SQLite: измените provider в `prisma/schema.prisma` на `"sqlite"` и `DATABASE_URL="file:./dev.db"`

### Frontend не подключается
- Проверьте, что backend запущен на порту 8000
- Проверьте `VITE_API_URL` в frontend/.env
- Откройте DevTools → Console для ошибок

### Ошибки Clerk
- Проверьте правильность ключей
- В Clerk Dashboard убедитесь, что `http://localhost:5173` добавлен в **Allowed Origins**

---

## 📚 Дополнительно

- [Полный README](./README.md)
- [Деплой Гайд](./DEPLOYMENT_GUIDE.md)
- [Clerk Docs](https://clerk.com/docs)
- [Prisma Docs](https://www.prisma.io/docs)