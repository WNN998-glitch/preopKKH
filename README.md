# Preop Checklist — shared app (Node + Postgres)

This is the upgraded version of the tool: a small Express server backed by Postgres, so the Elective Preop room lists, checkmarks, and the Anesthesia Preop form are stored on the server instead of one browser's local storage. Open the same URL from any computer and you see the same data — solves the "wrong computer, no printer" problem, and is the same foundation your team will use to check items together.

## Deploy to Render (manual — no Blueprint)

`render.yaml` in this folder is unused for this path — you can ignore or delete it. These steps create the database and the web service one at a time in the dashboard instead.

1. Push this folder to a GitHub (or GitLab) repo.
   ```
   git init
   git add .
   git commit -m "Preop checklist app"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
   (Double-check on GitHub afterward that `package.json` and `server.js` show up with their full names — Windows has been truncating filenames on this push in the past.)

2. **Create the database first.**
   - Go to [dashboard.render.com/new/database](https://dashboard.render.com/new/database) (or **New +** → **Postgres**).
   - Name it something like `preop-checklist-db`, pick a region, choose an instance type (Free is fine to start — see the durability note below), and click **Create Database**.
   - Wait for its status to show **Available**.
   - On the database's **Info** page, find the **Internal Database URL** under **Connect** — copy it. (Use the *internal* one, not external — it's faster and free, since the web service and database will run in the same region.)

3. **Create the web service.**
   - **New +** → **Web Service** → connect your GitHub repo.
   - **Name:** `preop-checklist-app` (or whatever you like).
   - **Region:** same region you picked for the database.
   - **Language/Runtime:** Node.
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - Instance type: Free to start, or a paid tier if you want to skip the spin-down delay.
   - Open **Advanced** → **Add Environment Variable**:
     - Key: `DATABASE_URL`
     - Value: paste the Internal Database URL you copied in step 2.
   - Click **Create Web Service**.

4. Render builds and deploys. First deploy takes a few minutes. You'll get a URL like `https://preop-checklist-app.onrender.com` — that's the one link everyone opens.

## Two things to decide before real use

**1. The free plan isn't durable enough for daily use.**
Render's free Postgres database auto-expires 30 days after creation (then a 14-day grace period, then it's deleted with all data). The free web service also spins down after 15 minutes of inactivity and briefly cold-starts on the next request. For something you rely on every day, plan to upgrade the database to a paid plan (starts around $6–7/month) before the 30-day mark — otherwise you'll lose the list and check history.

**2. This app has no login — anyone with the link can view and edit it.**
You chose "anyone with the link" for now, which is the simplest way to get your team checking things off together. But the data includes real patient names, HN, and diagnoses. Practical ways to reduce exposure:
- Don't post the link anywhere public — share it directly with your team.
- Ask Render to restrict the service to specific IP ranges (hospital network only) if that's an option on your plan.
- If this grows beyond your immediate team, it's worth adding a simple shared password gate, or real per-person login, before wider rollout.

## What's different from the old single-file version

- `Refresh` button + automatic sync every 15 seconds — pulls in changes from other computers/teammates.
- Checkbox ticks, uploaded room lists, and the Anesthesia Preop form all save to the server (small delay while it syncs — the status text bottom-right shows "Synced HH:MM:SS" or a sync error).
- Everything else (upload flow, filtering of cancelled/duplicate rows, delete buttons, print layout) is unchanged from the browser-only version.

## Local testing (optional)

```
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/preop_checklist npm start
```
Then open `http://localhost:3000`.
