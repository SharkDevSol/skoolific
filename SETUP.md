# Skoolific — School Management System (Template)

Generic, school-independent version of the Skoolific system. Clone it, set up
the database, add your school's name/logo, and deploy.

## What is included

- `APP/` — web admin panel (React + Vite). Build with `npm run build`,
  serve `dist/` with nginx.
- `backend/` — Node.js/Express API. Run with `node server.js` (or pm2).
- `frontend/`, `packages/` — shared UI packages and desktop/mobile wrappers.

## Quick setup for a new school

1. **Database**: create a Postgres database and user:
   ```sql
   CREATE DATABASE skoolific;
   CREATE USER school_user WITH PASSWORD 'strong_password_here';
   GRANT ALL PRIVILEGES ON DATABASE skoolific TO school_user;
   ```
2. **Backend config**: copy `backend/.env.example` to `backend/.env` and fill:
   - `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
   - `JWT_SECRET` (generate a strong random secret)
   - `PORT` (the port the backend listens on)
3. **Install & run backend**:
   ```bash
   cd backend && npm install && node server.js
   ```
4. **Install & build frontend**:
   ```bash
   cd APP && npm install && npm run build
   ```
5. **Serve**: point nginx at `APP/dist/` and proxy `/api` to the backend port.
6. **Branding**: log in as admin → Settings → upload your school logo and
   name. The login page, receipts and report card use the school branding
   automatically.
7. **Push notifications (optional)**: save your Firebase service account JSON
   as `backend/firebase-service-account.json` (never commit it).

## No hardcoded connections

This template has NO database password, NO server URL, and NO port baked in —
everything comes from `backend/.env` at runtime. The frontend auto-detects its
own domain in production.
