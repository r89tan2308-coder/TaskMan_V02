# 🚀 TaskMan RPG - Production Info

## 📦 Clerk Authentication Keys
```
CLERK_SECRET_KEY=sk_test_wEs1Gwy0C2qLtmhgDuhUbjDQyjmE9OFIpwwpJ2dHAJ
CLERK_PUBLISHABLE_KEY=pk_test_cmVzb2x2ZWQtZmlzaC04OS5jbGVyay5hY2NvdW50cy5kZXYk
```

## 🗄️ Render.com Services

### Backend Web Service
- **Name**: taskman-v01
- **URL**: https://taskman-v01.onrender.com
- **Root Directory**: `backend`

### PostgreSQL Database
- **Name**: taskman-db
- **Internal Database URL**: (сохраните из Render Dashboard)
- **Connection String**: PostgreSQL URL из Render

## 🔧 Git Commands

### Основные команды
```bash
# Проверить статус
git status

# Добавить все изменения
git add .

# Создать коммит
git commit -m "Your message here"

# Отправить на GitHub
git push

# Создать новую ветку
git checkout -b feature-name

# Переключиться на main
git checkout main
```

## 🌐 URLs

### GitHub Repository
https://github.com/r89tan2308-coder/TaskMan_v01

### Clerk Dashboard
https://dashboard.clerk.com

### Render Dashboard
https://dashboard.render.com

## 📝 Environment Variables для Production

### Backend (Render Web Service)
```
DATABASE_URL=<Internal Database URL from Render>
CLERK_SECRET_KEY=sk_test_wEs1Gwy0C2qLtmhgDuhUbjDQyjmE9OFIpwwpJ2dHAJ
CLERK_PUBLISHABLE_KEY=pk_test_cmVzb2x2ZWQtZmlzaC04OS5jbGVyay5hY2NvdW50cy5kZXYk
```

### Frontend (Vercel)
```
VITE_API_URL=https://taskman-v01.onrender.com
VITE_CLERK_PUBLISHABLE_KEY=pk_test_cmVzb2x2ZWQtZmlzaC04OS5jbGVyay5hY2NvdW50cy5kZXYk
```

## 🔄 Deployment Process

### Backend на Render.com
1. Push код на GitHub: `git push`
2. Render автоматически деплоит
3. Проверить логи в Render Dashboard

### Frontend на Vercel (следующий шаг)
1. Зайти на vercel.com
2. Import проект из GitHub
3. Указать Root Directory: `frontend`
4. Добавить environment variables
5. Deploy!

## 📊 Build Commands

### Backend
- **Build Command**: `bash build-production.sh`
- **Start Command**: `npm start`
- **Примечание**: Build script автоматически переключает Prisma на PostgreSQL для production

### Frontend
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

## ⚠️ Important Notes

- Ключи с префиксом `test_` - только для разработки
- Для production создайте production keys в Clerk
- Не коммитьте `.env` файлы в Git
- После изменений в schema.prisma запускайте миграции

## 🆘 Troubleshooting

### Backend не запускается
1. Проверьте логи в Render Dashboard
2. Убедитесь, что DATABASE_URL правильный
3. Проверьте, что миграции применились

### Frontend не подключается к Backend
1. Проверьте VITE_API_URL в Vercel
2. Убедитесь, что Backend работает (статус Live)
3. Проверьте CORS настройки в backend

## 📱 Contact

- GitHub: r89tan2308-coder
- Email: r89tan2308@gmail.com
