# Uptime — AI-Powered Monitoring Platform

Monitor websites, APIs and servers with real-time alerts and beautiful analytics.

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env with your SMTP credentials

# 2. Start everything
docker-compose up --build

# 3. Open in browser
open http://localhost
```

- Frontend: http://localhost
- API docs: http://localhost/api/docs
- Backend API: http://localhost/api

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | FastAPI, SQLAlchemy, PostgreSQL, Alembic |
| Worker | Celery, Redis, aiohttp |
| Infra | Docker Compose, Nginx |

## Development

```bash
# Database only (needed for backend/worker local development)
docker-compose up -d postgres redis

# Backend only
cd backend && pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload

# Frontend only
cd frontend && npm install && npm run dev

# Worker only
cd worker && pip install -r requirements.txt
celery -A celery_app worker --loglevel=info
```

## Environment Variables

See `.env.example` for all available variables.

For local backend development outside Docker, use `backend/.env` with:

```env
DATABASE_URL=postgresql://uptime:uptime_secret@localhost:5432/uptime_db
```

SQLite is disabled; run PostgreSQL and apply Alembic migrations before starting the API.

## API Documentation

After starting, visit http://localhost/api/docs for the interactive Swagger UI.

# UPTIME-
