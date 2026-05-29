# Деплой RentSpace.by на Vercel

Проект настроен как **монолит**: React-сборка отдаётся статически, API — через Serverless Function (`api/index.js`).

## Что нужно заранее

1. Репозиторий на **GitHub** (кнопка «Continue with GitHub» на Vercel).
2. **MySQL в облаке** с доступом из интернета (Vercel не даёт свою MySQL):
   - [Railway](https://railway.app) — MySQL + удобно для старта
   - [Aiven](https://aiven.io) — бесплатный tier MySQL
   - или удалённый MySQL на hoster.by (Remote MySQL в cPanel)
3. Аккаунт [Vercel](https://vercel.com).

## Ограничения на Vercel

| Функция | На Vercel |
|--------|-----------|
| Сайт + API | ✅ |
| MySQL | ✅ внешняя БД |
| Загрузка файлов (планы, договоры) | ⚠️ временное хранилище `/tmp` — после перезапуска функции файлы пропадают. Для продакшена лучше VPS/hoster.by или позже S3 |
| Долгие импорты Excel | ⚠️ лимит времени функции (до 60 с) |

Для полноценных загрузок и импорта используйте деплой на **hoster.by** (см. README.md).

---

## Шаг 1. GitHub

```bash
git init
git add .
git commit -m "Prepare Vercel deploy"
git remote add origin https://github.com/ВАШ_ЛОГИН/rentspace-by.git
git push -u origin main
```

## Шаг 2. Импорт в Vercel

1. [vercel.com/new](https://vercel.com/new) → **Continue with GitHub**.
2. Выберите репозиторий `RentSpace.by`.
3. Vercel подхватит `vercel.json` автоматически:
   - **Install:** `npm install && npm install --prefix client`
   - **Build:** `npm run build`
   - **Output:** `server/public`
4. **Не** меняйте Framework на «Vite» отдельно — оставьте настройки из `vercel.json`.

## Шаг 3. Переменные окружения

В проекте Vercel: **Settings → Environment Variables** (для Production):

| Переменная | Пример | Обязательно |
|------------|--------|-------------|
| `NODE_ENV` | `production` | ✅ |
| `JWT_SECRET` | длинная случайная строка | ✅ |
| `JWT_EXPIRES_IN` | `7d` | |
| `APP_NAME` | `RentSpace.by` | |
| `APP_URL` | `https://ваш-проект.vercel.app` | ✅ |
| `DB_HOST` | хост MySQL | ✅ |
| `DB_PORT` | `3306` | ✅ |
| `DB_NAME` | имя БД | ✅ |
| `DB_USER` | пользователь | ✅ |
| `DB_PASSWORD` | пароль | ✅ |
| `DB_SSL` | `true` (если облако требует SSL) | часто ✅ |
| `UPLOAD_DIR` | `/tmp/rentspace-uploads` | на Vercel по умолчанию |

`JWT_SECRET` сгенерируйте, например:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Шаг 4. База данных

На своём компьютере с доступом к облачной MySQL:

```bash
# в .env локально подставьте те же DB_* что на Vercel
npm run migrate
npm run seed
```

Проверка после деплоя: `https://ваш-проект.vercel.app/api/health`

## Шаг 5. Деплой

Нажмите **Deploy**. После успешной сборки откройте URL проекта и войдите (после `seed`):

| Email | Пароль |
|-------|--------|
| director@rentspace.by | demo1234 |

---

## Деплой через CLI (опционально)

```bash
npm i -g vercel
vercel login
vercel link
vercel env pull .env.vercel.local   # подтянуть переменные
vercel --prod
```

---

## Частые ошибки

### `FUNCTION_INVOCATION_FAILED` / 500 на `/api`

- Проверьте `DB_*` и `DB_SSL=true` для Railway/Aiven.
- Откройте **Vercel → Deployments → Logs**.

### Сборка падает на `client`

- Убедитесь, что в репозитории есть `client/package.json`.
- Локально: `npm install && npm install --prefix client && npm run build`.

### Логин не работает

- Выполнены ли `migrate` и `seed` на той же БД, что в переменных Vercel?
- Совпадает ли `JWT_SECRET` после смены (старые токены недействительны).

### Белый экран после входа

- Проверьте `/api/health` в браузере.
- В DevTools → Network смотрите ответы `/api/*`.

---

## Обновления

Каждый `git push` в ветку `main` (если включён Auto Deploy) пересобирает проект на Vercel.
