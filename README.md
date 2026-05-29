# RentSpace.by

Монолитная веб-платформа для управления арендными площадями торговых центров и коммерческой недвижимости.

- **Backend:** Node.js, Express.js, MySQL, Knex
- **Frontend:** React, TypeScript, Vite (сборка в `server/public`)
- **Первый объект:** ТРК «Квартал», г. Речица

## Структура проекта

```
rent-space/
├── package.json          # корневые скрипты dev/build/start/migrate
├── .env.example
├── scripts/
│   └── copy-client-dist.js
├── server/
│   ├── app.js            # точка входа для cPanel / hoster.by
│   ├── config/
│   ├── db/
│   ├── migrations/
│   ├── seeders/
│   ├── routes/
│   ├── middlewares/
│   ├── public/           # собранный React (после npm run build)
│   └── uploads/
└── client/
    ├── vite.config.ts
    └── src/
```

## Требования

- Node.js 18+
- MySQL 8+ (или MariaDB 10.5+)

## Локальный запуск

### 1. Установка

```bash
npm install
cd client && npm install && cd ..
```

### 2. Переменные окружения

```bash
cp .env.example .env
```

Заполните `DB_*`, `JWT_SECRET` в `.env`.

### 3. База данных

Создайте базу MySQL `rent_space` и пользователя с правами на неё.

```bash
npm run migrate
npm run seed
```

### 4. Режим разработки

```bash
npm run dev
```

- Frontend: http://localhost:5173 (прокси `/api` → Express)
- Backend: http://localhost:3000

### 5. Production-сборка локально

```bash
npm run build
NODE_ENV=production npm start
```

Откройте http://localhost:3000

## Демо-пользователи (после seed)

| Роль        | Email                    | Пароль    |
|-------------|--------------------------|-----------|
| Super Admin | admin@rentspace.by       | demo1234  |
| Директор    | director@rentspace.by    | demo1234  |
| Заведующая  | manager@rentspace.by     | demo1234  |
| Бухгалтер   | accountant@rentspace.by  | demo1234  |

## API

- `GET /api/health` — проверка приложения и БД
- `POST /api/auth/login` — вход
- `GET /api/auth/me` — текущий пользователь (Bearer token)

## Деплой на Vercel

Пошаговая инструкция: **[docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md)**.

Кратко: репозиторий на GitHub → Import в Vercel → переменные `DB_*`, `JWT_SECRET`, `APP_URL` → миграции на облачную MySQL.

## Деплой на hoster.by / cPanel

### 1. MySQL

1. В cPanel → **MySQL Databases** создайте базу, например `username_rent_space`.
2. Создайте пользователя БД и назначьте ему все права на эту базу.
3. Запомните хост (обычно `localhost`), имя БД, пользователя и пароль.

### 2. Загрузка проекта

Загрузите файлы репозитория на хостинг (Git deploy или File Manager), без `node_modules`.

### 3. Файл `.env` в корне проекта

```env
NODE_ENV=production
APP_NAME=RentSpace.by
APP_URL=https://ваш-домен.by
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_NAME=username_rent_space
DB_USER=username_rent_user
DB_PASSWORD=...

JWT_SECRET=длинный_случайный_секрет
JWT_EXPIRES_IN=7d

UPLOAD_DIR=server/uploads
MAX_UPLOAD_SIZE_MB=25
```

На shared hosting порт часто задаётся панелью — используйте переменную `PORT` из окружения cPanel Node.js App.

### 4. Установка и сборка (SSH или Terminal в cPanel)

```bash
npm install
cd client && npm install && cd ..
npm run build
npm run migrate
npm run seed
```

`npm run build` собирает React и копирует `client/dist` → `server/public`.

### 5. Node.js Application в cPanel

1. **Setup Node.js App** → Create Application
2. **Application root:** корень проекта (где `package.json`)
3. **Application startup file:** `server/app.js`
4. **Application mode:** Production
5. Добавьте переменные из `.env` в интерфейсе приложения (если требуется)
6. Запустите приложение

### 6. Проверка

- `https://ваш-домен.by/api/health` → `{ "status": "ok", "app": "RentSpace.by", "db": "connected" }`
- `https://ваш-домен.by/` — landing
- `https://ваш-домен.by/login` — вход

### 7. Права на каталоги

Убедитесь, что запись разрешена для:

- `server/uploads/`
- `server/public/` (после сборки)

## Скрипты

| Команда              | Описание                          |
|----------------------|-----------------------------------|
| `npm run dev`        | Express + Vite dev                |
| `npm run build`      | Сборка client → server/public     |
| `npm start`          | Production Express                |
| `npm run migrate`    | Миграции Knex                     |
| `npm run seed`       | Демо-данные                       |
| `npm run db:setup`   | migrate + seed                    |

## Реализованный функционал

- Полная схема MySQL (20+ таблиц): помещения, договоры, начисления, платежи, расходы, план-факт, импорт, аудит
- JWT и роли: super_admin, org_admin, director, manager, accountant, viewer
- **Интерактивная SVG-карта** `/map` — клик по помещению, карточка, сдать/освободить, платёж
- **Редактор карт** `/map-editor` — рисование polygon/rect поверх плана
- Арендаторы, договоры, начисления (генерация), платежи, расходы
- Дашборд директора и главная заведующей (Recharts, KPI)
- Отчёты и экспорт Excel
- Импорт Excel (листы: аренда по счетам, план-факт, отопление)
- Seed: ТРК «Квартал», здания 56/56а/56е/62, 16 помещений с SVG, демо-арендаторы

### Импорт вашего Excel

Файл в корне проекта: `КВАРТАЛ_1АвтоматическиВосстановлено.xlsx`

```bash
npm run import:kvartal
```

Или загрузите через **Настройки → Импорт Excel** в личном кабинете.

Импортируются листы:
- **аренда по счетам** — 74 арендатора, договоры, площади, ставки, аренда и возмещения по месяцам
- **показ.план  и факт** — KPI план/факт на 2026
- **отопление** — расходы (дрова, з/п, пиление)
- Здания **56, 56а, 56е, 62** создаются автоматически

### Страницы

| URL | Описание |
|-----|----------|
| `/` | Landing |
| `/login` | Вход |
| `/dashboard` | Дашборд директора |
| `/manager` | Главная заведующей |
| `/map` | Карта помещений (SVG) |
| `/map-editor` | Редактор планов |
| `/rooms` | Список помещений |
| `/tenants-contracts` | Арендаторы и договоры |
| `/payments` | Платежи |
| `/charges` | Начисления |
| `/reports` | Отчёты |
| `/settings` | Настройки и импорт |

## Лицензия

Proprietary — RentSpace.by
