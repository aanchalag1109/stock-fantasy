# ProbTrade — Node.js Migration Guide

## Status: COMPLETE

The full Laravel to Node.js + Express + MongoDB migration is done.

---

## How to Start

### Admin Panel (port 8001)

```bash
cd c:\xampp\htdocs\pro\node-project

# Development with auto-reload
npm run admin:dev

# Production
npm run admin:start
```

### Main API (port 8000)

```bash
npm run dev      # development
npm run start    # production
```

### Both servers together — open 2 PowerShell terminals

Terminal 1:
```bash
npm run dev
```

Terminal 2:
```bash
npm run admin:dev
```

---

## URLs

| Service | URL |
|---------|-----|
| Admin Login | http://localhost:8001/login |
| Admin Dashboard | http://localhost:8001/dashboard |
| Main API | http://localhost:8000/api |
| API Health | http://localhost:8000/health |

---

## Admin Login Setup

Login requires a user with is_admin: true in MongoDB.

Run this once to set your user as admin:

```bash
cd c:\xampp\htdocs\pro\node-project
node -e "
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/proborzs_prob').then(async () => {
  const hash = await bcrypt.hash('admin123', 10);
  await mongoose.connection.db.collection('users').updateOne(
    { email: 'admin@probtrade.com' },
    { \$set: { is_admin: true, password: hash, name: 'Admin' } },
    { upsert: true }
  );
  console.log('Done: admin@probtrade.com / admin123');
  process.exit(0);
});
"
```

Or in MongoDB Compass / shell:
```js
db.users.updateOne({ email: "your@email.com" }, { $set: { is_admin: true } })
```

---

## Admin Panel Pages

| Page | URL |
|------|-----|
| Login | /login |
| Dashboard | /dashboard |
| Users | /users |
| User Detail | /users/:id |
| Edit User | /users/:id/edit |
| Sessions | /sessions |
| Contests | /contests |
| Transactions | /transactions |
| Withdrawals | /withdrawals |
| KYC | /kyc |
| Tickets | /tickets |
| Banners | /banners |
| Announcements | /announcements |
| Notifications | /notifications/send |
| Settings | /settings |
| Cron Logs | /cron |

---

## API Testing (port 8000)

### Health check
```bash
curl http://localhost:8000/health
```

### Register
```bash
curl -X POST http://localhost:8000/api/v1/auth/register -H "Content-Type: application/json" -d "{\"name\":\"Test\",\"mobile\":\"+911234567890\",\"password\":\"test123\",\"country_code\":\"+91\"}"
```

### Login
```bash
curl -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d "{\"mobile\":\"+911234567890\",\"password\":\"test123\"}"
```

### Authenticated requests (replace TOKEN)
```bash
curl http://localhost:8000/api/v1/sessions -H "Authorization: Bearer TOKEN"
curl http://localhost:8000/api/v1/contests -H "Authorization: Bearer TOKEN"
curl http://localhost:8000/api/v1/wallet/balance -H "Authorization: Bearer TOKEN"
curl http://localhost:8000/api/v1/prices/live
```

---

## Project Structure

```
node-project/
  server.js             -- API server port 8000
  admin-server.js       -- Admin panel port 8001
  src/
    app.js              -- API Express app
    admin/
      app.js            -- Admin Express app
      controllers/      -- 9 admin controllers
      routes/           -- 15 route files
      middleware/       -- auth guard
      helpers/          -- render.js
      views/
        layouts/        -- main.ejs
        partials/       -- sidebar, pagination
        auth/dashboard/users/sessions/contests/
        transactions/withdrawals/kyc/tickets/
        banners/announcements/notifications/
        settings/cron/
    config/
    controllers/        -- 14 API controllers
    models/             -- 19 Mongoose models
    routes/             -- 14 API route files
    scheduler/          -- cron jobs
```

---

## Environment (.env)

```
PORT=8000
ADMIN_PORT=8001
MONGODB_URI=mongodb://127.0.0.1:27017/proborzs_prob
JWT_SECRET=probtrade-secret-2026
NODE_ENV=development
```
