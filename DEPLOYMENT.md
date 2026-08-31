# SentinelAI — Deployment Reference

> Last updated: 2026-08-31. Keep this file current whenever the deployment setup changes.

---

## Live URLs

| Service | URL |
|---|---|
| Frontend | https://sentinalsec.vercel.app |
| Backend API | https://sentinel-api-sigma.vercel.app |

---

## Architecture

```
User browser
  │
  ├── GET /  →  sentinalsec.vercel.app  (Vercel — static Vite build)
  │
  └── GET /api/*  →  sentinalsec.vercel.app  →  proxy  →  sentinel-api-sigma.vercel.app/api/*
                      (Vercel route rewrite in .vercel/output/config.json)
```

All API calls from the frontend use **relative URLs** (`/api/...`).
In production, `VITE_API_URL` is set to `''` so `API_URL` is always empty.
Vercel's frontend routing rewrites `/api/(.*)` to `https://sentinel-api-sigma.vercel.app/api/$1`.

---

## GitHub OAuth Flow

```
1. User clicks "Login with GitHub"
2. Frontend fetches GET /api/auth/github
3. Vercel proxy → backend → returns { url: "https://github.com/login/oauth/authorize?..." }
4. Frontend redirects browser to GitHub OAuth URL
5. User authorizes → GitHub redirects to GITHUB_CALLBACK_URL
6. Backend exchanges code for access token, creates/updates user in MongoDB
7. Backend redirects to https://sentinalsec.vercel.app/auth/callback?token=<JWT>
8. Frontend stores JWT in localStorage, user is logged in
```

**GITHUB_CALLBACK_URL** (set in Vercel backend env vars):
```
https://sentinalsec.vercel.app/api/auth/github/callback
```

**GitHub OAuth App settings** (github.com → Settings → Developer Settings → OAuth Apps):
- Homepage URL: `https://sentinalsec.vercel.app`
- Callback URL: `https://sentinalsec.vercel.app/api/auth/github/callback`

---

## CI/CD — GitHub Actions

File: `.github/workflows/deploy.yml`
Triggers on push to `main`.

**Order:**
1. `deploy-backend` — runs `npx vercel deploy --prod` from `./backend`
2. `deploy-frontend` — waits for backend, runs `npm run build:frontend`, then `npx vercel deploy --prod --prebuilt`

**Required GitHub Secrets:**
- `VERCEL_TOKEN` — Vercel personal access token

**Vercel Project IDs (hardcoded in workflow):**
- Frontend: `prj_bUTJ5GAGIV3OE1UvRBAaZ3TyeYGS`
- Backend: `prj_3vTaPfgOsNe3YmPowxOTMdS1GFhY`

---

## Backend Vercel Config

File: `backend/vercel.json`
- Build: `npm run build` (runs `tsc` → outputs to `dist/`)
- Entry: `dist/index.js`
- All routes → `dist/index.js` (Express handles routing internally)

---

## Environment Variables (backend — set in Vercel dashboard)

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | JWT signing secret (required — app crashes without it) |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `GITHUB_CALLBACK_URL` | Must match GitHub OAuth App callback URL |
| `FRONTEND_URL` | `https://sentinalsec.vercel.app` |
| `GROQ_API_KEY` / `GROQ_API_KEYS` | Groq API keys (comma-separated for rotation) |
| `GEMINI_API_KEYS` | Gemini API keys (comma-separated) |
| `VERCEL_TOKEN` | For `@vercel/sandbox` CLI probes in Phase 7 |
| `VERCEL_TEAM_ID` | For `@vercel/sandbox` |
| `VERCEL_PROJECT_ID` | For `@vercel/sandbox` |
| `NODE_ENV` | `production` |

---

## If Something Breaks

### GitHub Login returns 404 on `/api/auth/github`

The backend is down or its Vercel deployment is stale.

**Diagnose:** `curl https://sentinel-api-sigma.vercel.app/health`
- If 404 → backend is down. Redeploy:
  ```bash
  cd backend
  npx vercel deploy --prod --yes
  ```
- If `{"status":"ok"}` → routing issue. Check the frontend proxy config in `.github/workflows/deploy.yml` (the hardcoded `sentinel-api-sigma.vercel.app` URL in config.json generation).

**Root cause of the 2026-08-31 incident:** GitHub Actions CI had deployed the backend successfully but Vercel was serving a stale/broken cached state. Direct `vercel deploy --prod` from the CLI forced a fresh build + alias and restored the endpoint.

### Frontend build fails in CI ("Missing script: build")

The workflow uses `npm run build:frontend` (not `npm run build`). If this breaks again, check `package.json` scripts — the correct script name is `build:frontend`.

### Backend works locally but 404 on Vercel

1. Check `backend/vercel.json` — `dist/index.js` must exist after `npm run build`
2. Run `npm run build` in `./backend` locally and confirm `dist/index.js` is created
3. Check Vercel build logs at: https://vercel.com/ragulvls-projects/sentinel-api

### MongoDB shows "disconnected" in `/health`

Normal on cold start — MongoDB Atlas connects lazily on first real request. Not an error.

---

## Manual Deploy (bypass CI)

```bash
# Backend
cd backend
npx vercel deploy --prod --yes

# Frontend (from project root)
npm run build:frontend
npx vercel deploy --prod --prebuilt
```
