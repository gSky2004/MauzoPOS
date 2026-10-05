# Free hosting: Supabase + Render + Vercel (trial setup)

Runs the full system for **TZS 0/month**: database on Supabase, API on Render,
website on Vercel. Do the steps **in order** — each one needs the previous URL.

## What free means (honest limits)

- **Render free sleeps** after ~15 min idle. First request after sleep takes
  ~50 seconds to wake up, then it's fast. Fine for a trial, not for a busy shop.
- **Supabase free** = 500 MB database (plenty for a small shop) + daily backups
  kept 7 days.
- **Uploads are temporary here.** Render free has no permanent disk: sale-evidence
  photos survive restarts but **vanish on every redeploy**. Everything else
  (sales, stock, debts, expenses) lives safely in Supabase.
- **Gemini free tier** throttles rapid-fire questions; normal use is fine.

## Step 1 — Supabase (database)

1. Create a free project at supabase.com (any region close to you).
2. Go to **Project Settings → Database** and copy the **Session mode**
   connection string (the one with port **5432**, marked "Session pooler" —
   use this, not the 6543 Transaction one).
3. It looks like:
   `postgresql://postgres.xxxx:PASSWORD@aws-0-xx.pooler.supabase.com:5432/postgres`
   Keep it — you paste it into Render next.

## Step 2 — Render (API)

1. Push this repo to GitHub (make sure `server/.env` is NOT committed —
   `.gitignore` already excludes it).
2. In Render: **New → Blueprint**, point at the repo. It reads `render.yaml`.
3. Fill the prompted values:
   - `DATABASE_URL` → the Supabase string from step 1
   - `ADMIN_PASSWORD` → a strong password (this becomes the admin login)
   - `SHOPKEEPER_PASSWORD` → a strong password (default logins are public
     knowledge — do not keep `Shop@1234`)
   - `GEMINI_API_KEY` → your key (empty is allowed; AI just reports
     "unavailable" while everything else works)
   - Leave `CLIENT_URLS` empty for now.
4. Deploy. Open **Shell** on the service and run **once**:
   ```
   node src/db/setup.js && node src/db/seed.js
   ```
   This creates tables, the product catalog, and your admin/shopkeeper accounts.
   **Never run seed again afterwards** — it wipes sales and transactions.
5. Copy your backend URL, e.g. `https://mauzopos-api.onrender.com`.
   Check `https://…/api/health` returns `{"status":"ok"}` (first hit may take
   ~50 s while it wakes up).

## Step 3 — Vercel (website)

1. Import the same repo. Set **Root Directory = `client`**, framework Vite.
2. Environment variable: `VITE_API_BASE_URL` = your Render URL from step 2
   (no trailing slash). Deploy.
3. Copy your site URL, e.g. `https://mauzopos.vercel.app`.

## Step 4 — connect them

1. Back in Render → your service → **Environment**: set
   `CLIENT_URLS=https://mauzopos.vercel.app` (your real Vercel URL).
2. **Manual Deploy → Restart** (env changes need it).

## Step 5 — verify the trial

1. Open the site, login as admin (your `ADMIN_EMAIL` + password).
2. Record a test sale, receive stock, record an expense, then **delete them**
   so the aunt starts clean.
3. Ask the AI assistant one question.
4. Change nothing else. Hand over the admin login.

## Later updates

Push to GitHub → Render and Vercel redeploy automatically. Database and
uploads on existing deploys are untouched by code updates. (Uploads only
disappear on Render **redeploys** — see limits above.)

## Leaving trial → real hosting

When she pays: move to the VPS setup in `deploy/README.md` (permanent disks,
no sleeping, same codebase, same database dump restores with `pg_restore`).
