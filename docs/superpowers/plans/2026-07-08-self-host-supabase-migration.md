# Self-Host Supabase on Hostinger VPS — Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move PharmShift's Postgres database off Supabase Cloud (free tier, ~5GB/mo egress cap already hit) onto a self-hosted Supabase stack (Postgres + PostgREST + Realtime + Kong) running on the user's own Hostinger VPS, with zero changes to application query code and no data loss.

**Architecture:** The Next.js app stays on Vercel exactly as-is. Only the data layer moves: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` get repointed from `*.supabase.co` to a self-hosted stack on the VPS, reachable over HTTPS through a reverse proxy. Because the app never used Supabase Auth or Storage (custom JWT via `lib/session.ts`, no file uploads), the self-hosted stack can be trimmed to just `db` + `rest` (PostgREST) + `realtime` + `kong` — auth/storage/studio/analytics services are not needed.

**Tech Stack:** Docker + Docker Compose on a Hostinger VPS (Ubuntu 24.04 LTS), official `supabase/docker` self-host compose file as the base, Caddy for automatic TLS reverse-proxying, `pg_dump`/`psql` for schema+data migration, existing `@supabase/supabase-js` / `@supabase/ssr` client code (unchanged).

## Global Constraints

- **User confirmed self-hosting over Supabase Pro** ($25/mo → 250GB egress) — proceeding with VPS migration is a deliberate choice, not just an egress fix. Do not re-litigate this mid-plan.
- **No Supabase Auth, no Supabase Storage in use** — confirmed via repo grep (zero `.storage.` calls; auth is 100% custom JWT in `lib/session.ts`). The self-hosted stack does not need `auth`/`gotrue`, `storage`, `imgproxy`, or `studio` services.
- **App code must not change** — `lib/supabase.ts`, `lib/supabaseServer.ts`, and every `supabase.from(...)` call across `app/api/**` and `hooks/useShifts.ts` stay untouched. Only env var *values* change.
- **5 custom Postgres RPC functions must exist in the new DB** (used via `.rpc(...)` in the app): `accept_swap_request_atomic`, `apply_admin_shift_changes_atomic`, `apply_shift_owner_edits_atomic`, `cleanup_swap_request_chain_hops`, `record_access`. All are defined in `supabase/migrations/*.sql` and will come along automatically in the schema+data dump (Task 3, Task 7) — do not hand-write them.
- **3 Realtime channels must keep working**: `shifts-${monthYear}`, `swaps-${userId}`, `notifs-${userId}` (postgres_changes on tables `shifts`, `swap_requests`, `notifications` — see `hooks/useShifts.ts`). Realtime requires `wal_level=logical` and a `supabase_realtime` publication covering those 3 tables.
- **Cutover is a point-in-time dump, not a live migration** — writes to the old Supabase DB after the dump starts are lost. Requires an explicit maintenance window; do not attempt a "zero downtime" cutover for this project size.
- **Rollback is only clean before new writes land on the VPS DB** — after that, rolling back the env vars means losing those writes. State this plainly at cutover time, don't pretend rollback is free after go-live.
- **Backups must live off the VPS** — a disk failure on the VPS must not be able to destroy the only backup copy.
- **Assumed VPS spec** (confirm/upgrade before Task 1 if not already provisioned): Hostinger KVM 2 or higher — 2 vCPU / 8GB RAM / Ubuntu 24.04 LTS. This plan assumes that spec; a smaller VPS may need `realtime`/`rest` memory limits tuned down.
- **Assumed Hostinger datacenter region**: Singapore (closest to Thailand). If actually different, adjust the Vercel function region in Task 8 to match.
- **Egress relocates, it doesn't vanish** — after this migration, DB traffic counts against the Hostinger VPS's own bandwidth allowance instead of Supabase's cap, and Vercel's function-to-VPS calls still cross the public internet. Confirm the VPS plan's bandwidth allowance is comfortably above current usage before cutover.

---

## File Structure

This is primarily an infrastructure migration — most artifacts live on the VPS, not in the `pharmshift` git repo.

**On the VPS** (not tracked in git):
- `/opt/supabase/docker-compose.yml` — trimmed self-hosted stack (db, rest, realtime, kong)
- `/opt/supabase/.env` — stack secrets (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`)
- `/etc/caddy/Caddyfile` — reverse proxy + automatic TLS for the public DB domain
- `/opt/backup/pg_backup.sh` — nightly dump script, pushed off-VPS
- `/opt/backup/dumps/` — local backup staging (short retention, real retention lives off-VPS)

**In the `pharmshift` repo** (git-tracked or gitignored as noted):
- `.env.staging.local` (gitignored, Task 5) — points a local dev run at the new VPS backend for smoke testing before touching production
- `vercel.json` (modified, Task 8) — optionally pin function `regions` near the VPS datacenter

**Nothing in `app/`, `lib/`, `hooks/`, or `components/` changes.**

---

### Task 1: Provision & harden the VPS

**Files:** None in repo. VPS: firewall rules (`ufw`), Docker install.

**Interfaces:**
- Produces: SSH access to a hardened VPS with Docker + Docker Compose installed, ports 22/80/443 open, everything else closed, that Task 2 deploys onto.

- [ ] **Step 1: Confirm VPS spec**

SSH into the Hostinger VPS and check it matches the assumed spec:

```bash
ssh root@<vps-ip>
lsb_release -a          # expect Ubuntu 24.04 LTS (or 22.04)
nproc                   # expect >= 2
free -h                 # expect >= 8Gi total (4Gi is a hard minimum)
df -h /                 # expect >= 40G free for DB + Docker images + backups
```

If RAM is below 4GB, stop and upgrade the Hostinger plan before continuing — PostgREST + Realtime + Kong + Postgres will not run reliably below that.

- [ ] **Step 2: Create a non-root deploy user**

```bash
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

- [ ] **Step 3: Install Docker + Compose plugin**

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

- [ ] **Step 4: Configure firewall — only 22/80/443 reachable from the internet**

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Postgres (5432), PostgREST (3000 internal), Realtime (4000), and Kong's plain HTTP port (8000) must **not** be opened here — they'll only be reachable via Docker's internal network and the Caddy reverse proxy set up in Task 4.

- [ ] **Step 5: Verify**

```bash
su - deploy
docker run hello-world      # expect "Hello from Docker!"
sudo ufw status verbose     # expect: 22,80,443/tcp ALLOW Anywhere; nothing else
```

No repo changes in this task.

---

### Task 2: Deploy the trimmed self-hosted Supabase stack

**Files:** VPS: `/opt/supabase/docker-compose.yml`, `/opt/supabase/.env`

**Interfaces:**
- Consumes: hardened VPS + Docker from Task 1.
- Produces: a running `db` (Postgres), `rest` (PostgREST), `realtime`, and `kong` service reachable at `http://localhost:8000` on the VPS, plus a matching `ANON_KEY`/`SERVICE_ROLE_KEY` JWT pair for the app to use later.

- [ ] **Step 1: Fetch the official self-host compose file**

Use Supabase's own repo as the base rather than hand-authoring a compose file — its service list and image versions change across releases, and hand-copying one from memory risks being wrong for a production system:

```bash
su - deploy
mkdir -p /opt/supabase && cd /opt/supabase
git clone --depth 1 https://github.com/supabase/supabase.git supabase-src
cp -r supabase-src/docker/* .
cp .env.example .env
rm -rf supabase-src
```

- [ ] **Step 2: Generate real secrets**

```bash
# Postgres password
POSTGRES_PW=$(openssl rand -hex 24)
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${POSTGRES_PW}/" .env

# JWT secret (32+ chars) shared by PostgREST/Realtime/Kong to verify tokens
JWT_SECRET=$(openssl rand -hex 32)
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
echo "JWT_SECRET=${JWT_SECRET}"   # save this — needed again in Step 3
```

- [ ] **Step 3: Mint ANON_KEY / SERVICE_ROLE_KEY as real JWTs signed with JWT_SECRET**

The old Supabase Cloud anon/service keys will **not** validate against this stack — they must be freshly signed JWTs using the `JWT_SECRET` from Step 2. On any machine with Node:

```bash
npx --yes jsonwebtoken-cli 2>/dev/null || npm install --no-save jsonwebtoken
node -e '
const jwt = require("jsonwebtoken");
const secret = process.argv[1];
const iat = 1799000000; // fixed epoch seconds to avoid Date.now() drift across re-runs; any current timestamp works
const exp = iat + 10 * 365 * 24 * 3600; // ~10 years
for (const role of ["anon", "service_role"]) {
  console.log(role, jwt.sign({ role, iss: "supabase", iat, exp }, secret));
}
' "$JWT_SECRET"
```

Copy the two printed tokens into `.env` on the VPS:

```bash
sed -i "s/^ANON_KEY=.*/ANON_KEY=<paste anon token>/" .env
sed -i "s/^SERVICE_ROLE_KEY=.*/SERVICE_ROLE_KEY=<paste service_role token>/" .env
```

- [ ] **Step 4: Trim the compose file to only what this app uses**

Edit `docker-compose.yml` and remove (or comment out) the service blocks for: `auth`, `storage`, `imgproxy`, `studio`, `meta`, `functions`, `analytics`, `vector`. Keep: `db`, `rest`, `realtime`, `kong`, `supavisor` (connection pooler — worth keeping since Vercel serverless functions open many short-lived connections).

If `kong.yml` references routes for the removed services (e.g. `/auth/v1`, `/storage/v1`), delete those route blocks too — Kong will fail to start if it points at a service that no longer exists in the compose file. If `kong` fails on first boot, `docker compose logs kong` will name the missing upstream — remove that route and retry.

- [ ] **Step 5: Start the stack**

```bash
docker compose up -d
docker compose ps    # every remaining service should show "Up" or "healthy"
```

- [ ] **Step 6: Verify PostgREST is reachable through Kong**

```bash
curl -s http://localhost:8000/rest/v1/ \
  -H "apikey: <ANON_KEY from .env>" \
  -H "Authorization: Bearer <ANON_KEY from .env>"
```

Expect a JSON response (empty object or OpenAPI schema) — not a connection refused or a Kong 502.

No repo changes in this task; `.env` and `docker-compose.yml` stay on the VPS only (never commit secrets to the `pharmshift` repo).

---

### Task 3: Rehearse the schema migration on disposable data

**Files:** Local machine (temporary): `schema_only.sql` (not committed — delete after use).

**Interfaces:**
- Consumes: `SUPABASE_DB_URL` (direct Postgres connection string, from the Supabase Cloud dashboard → Project Settings → Database), the running stack from Task 2.
- Produces: a schema-complete but data-empty Postgres on the VPS, proven to work end-to-end with PostgREST + Realtime, before any real data migration is attempted.

Rather than replaying the 28 files in `supabase/migrations/` in some inferred order (some are undated, e.g. `add_cover_request_type.sql`, so their true historical order isn't recoverable from filenames alone, and manual hotfixes may have drifted from what's in the repo), dump the **live** schema directly — it's the actual source of truth, and this also rehearses exactly the mechanism Task 7 will use for the real cutover.

- [ ] **Step 1: Dump the live schema (no data) from Supabase Cloud**

```bash
pg_dump "$SUPABASE_DB_URL" --schema-only --schema=public --no-owner --no-privileges -f schema_only.sql
```

- [ ] **Step 2: Apply it to the VPS Postgres**

```bash
scp schema_only.sql deploy@<vps-ip>:/tmp/
ssh deploy@<vps-ip> 'docker compose -f /opt/supabase/docker-compose.yml exec -T db psql -U postgres -f /tmp/schema_only.sql'
```

- [ ] **Step 3: Enable logical replication + create the realtime publication**

```bash
ssh deploy@<vps-ip>
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "ALTER SYSTEM SET wal_level = logical;"
docker compose -f /opt/supabase/docker-compose.yml restart db
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c \
  "CREATE PUBLICATION supabase_realtime FOR TABLE shifts, swap_requests, notifications;"
```

- [ ] **Step 4: Verify the 5 RPC functions came through**

```bash
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "\df accept_swap_request_atomic"
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "\df apply_admin_shift_changes_atomic"
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "\df apply_shift_owner_edits_atomic"
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "\df cleanup_swap_request_chain_hops"
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "\df record_access"
```

Expect all 5 to list a matching function signature — not "Did not find any function."

- [ ] **Step 5: Verify PostgREST reflects the empty schema**

```bash
curl -s http://<vps-ip>:8000/rest/v1/holidays?select=* -H "apikey: <ANON_KEY>"
```

Expect `[]` (empty array — table exists, zero rows), not a 404/relation-not-found error.

- [ ] **Step 6: Verify Realtime end-to-end (highest-risk piece — do not skip)**

From a local Node REPL or a scratch script, using `@supabase/supabase-js` pointed at `http://<vps-ip>:8000` with the `ANON_KEY`:

```js
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('http://<vps-ip>:8000', '<ANON_KEY>');
supabase
  .channel('test-notifs')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
    console.log('REALTIME EVENT RECEIVED:', payload);
  })
  .subscribe((status) => console.log('subscribe status:', status));
```

While that's running, insert a row from another terminal:

```bash
ssh deploy@<vps-ip> 'docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c \
  "INSERT INTO notifications (user_id, type, title, body) VALUES (gen_random_uuid(), '\''test'\'', '\''hi'\'', '\''hi'\'');"'
```

Expect `REALTIME EVENT RECEIVED: ...` to print within a few seconds. If nothing arrives, check `docker compose logs realtime` for replication slot errors before moving on — Realtime is the piece most likely to silently fail.

No changes to the `pharmshift` repo in this task.

---

### Task 4: Reverse proxy + TLS

**Files:** VPS: `/etc/caddy/Caddyfile`

**Interfaces:**
- Consumes: a DNS A record for a subdomain (e.g. `db.yourdomain.com`) pointed at the VPS IP.
- Produces: `https://db.yourdomain.com` serving Kong over TLS; port 8000 no longer needs to be (and per Task 1, isn't) reachable directly from the internet.

- [ ] **Step 1: Point DNS at the VPS**

In your DNS provider, add an A record: `db.yourdomain.com` → `<vps-ip>`. Wait for propagation (`dig db.yourdomain.com` should return the VPS IP).

- [ ] **Step 2: Install Caddy**

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

- [ ] **Step 3: Configure the reverse proxy**

`/etc/caddy/Caddyfile`:

```
db.yourdomain.com {
    reverse_proxy localhost:8000
}
```

```bash
sudo systemctl reload caddy
```

Caddy automatically obtains and renews a Let's Encrypt certificate for the domain on first request.

- [ ] **Step 4: Verify HTTPS end-to-end**

```bash
curl -s https://db.yourdomain.com/rest/v1/holidays?select=* -H "apikey: <ANON_KEY>" -v 2>&1 | grep -E "SSL|HTTP/2 200"
```

Expect a successful TLS handshake and `HTTP/2 200` with `[]` as the body.

No changes to the `pharmshift` repo in this task.

---

### Task 5: Local staging smoke test against the new backend

**Files:**
- Create: `.env.staging.local` (repo root, gitignored)
- Modify: `.gitignore` (confirm `.env.staging.local` is covered by the existing `.env*.local` pattern — if not already, add it)

**Interfaces:**
- Consumes: the HTTPS endpoint from Task 4, the `ANON_KEY`/`SERVICE_ROLE_KEY` from Task 2.
- Produces: confidence that every feature the app uses against Supabase (auth session cookies, shift CRUD, swap RPC, admin batch RPC, realtime, push) works against the new backend — the actual go/no-go gate before real data is ever touched.

- [ ] **Step 1: Confirm `.gitignore` covers the staging env file**

```bash
grep -n "\.env" .gitignore
```

If `.env*.local` (or equivalent) isn't already present, add it before creating the file in Step 2.

- [ ] **Step 2: Create the staging env file**

```bash
cp .env.local .env.staging.local
```

Then edit `.env.staging.local` so only these three lines differ from `.env.local` (everything else — `SESSION_JWT_SECRET`, VAPID keys, `CRON_SECRET` — stays the same, since none of that is Supabase-related):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://db.yourdomain.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from Task 2>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from Task 2>
```

- [ ] **Step 3: Seed minimal test data**

The rehearsal DB from Task 3 has schema but no rows. Seed one admin user directly via `psql` (matching the `users` table shape in `supabase/migrations/`) so login has something to authenticate against:

```bash
ssh deploy@<vps-ip> 'docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "
INSERT INTO users (pha_id, prefix, f_name, l_name, nickname, role, password, must_change_password, is_active)
VALUES ('\''T001'\'', '\''นาย'\'', '\''Test'\'', '\''Admin'\'', '\''Test'\'', '\''admin'\'', '\''1234'\'', false, true);
"'
```

Check `app/api/auth/login/route.ts` for the exact password hashing scheme in use (the repo has since moved to hashed passwords per `20260530_hash_existing_user_passwords.sql` — insert a properly hashed value, not plaintext `'1234'`, or login will reject it).

- [ ] **Step 4: Run the app against staging and smoke-test manually**

```bash
cp .env.local .env.local.bak
cp .env.staging.local .env.local
npm run dev
```

Manually verify, using the browser:
- Login succeeds with the seeded test user
- Calendar page loads without console errors
- Realtime connects — Network tab shows an open websocket to `db.yourdomain.com`
- Create a shift for the test user (admin edit mode), confirm it persists and appears on reload
- Create a second test user, issue a swap request between them, accept it — this exercises `accept_swap_request_atomic`
- Trigger an admin batch edit — this exercises `apply_admin_shift_changes_atomic`

- [ ] **Step 5: Restore local env and clean up**

```bash
cp .env.local.bak .env.local
rm .env.local.bak
```

Leave `.env.staging.local` in place for now (still gitignored) in case Task 7 needs to re-run this smoke test after the real cutover dump.

- [ ] **Step 6: Commit the `.gitignore` fix only, if it needed one**

```bash
git add .gitignore
git commit -m "Ensure staging env file is gitignored"
```

(Skip this commit if `.gitignore` already covered it in Step 1 — nothing to commit.)

---

### Task 6: Off-VPS backups + uptime monitoring

**Files:** VPS: `/opt/backup/pg_backup.sh`, crontab entry.

**Interfaces:**
- Consumes: the running `db` container from Task 2.
- Produces: nightly encrypted-in-transit backups stored off the VPS, and an external uptime check alerting on failure — both must exist **before** real production data lands in Task 7.

- [ ] **Step 1: Write the backup script**

`/opt/supabase/backup/pg_backup.sh` (owned by `deploy`, `chmod +x`):

```bash
#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date +%F)
LOCAL_DIR=/opt/supabase/backup/dumps
REMOTE=hostinger-backup:pharmshift-db-backups   # rclone remote:path — configure in Step 2

mkdir -p "$LOCAL_DIR"
docker compose -f /opt/supabase/docker-compose.yml exec -T db \
  pg_dump -U postgres --schema=public --no-owner --no-privileges \
  | gzip > "$LOCAL_DIR/pharmshift-${STAMP}.sql.gz"

rclone copy "$LOCAL_DIR/pharmshift-${STAMP}.sql.gz" "$REMOTE"

# keep 14 days locally, prune older
find "$LOCAL_DIR" -name "pharmshift-*.sql.gz" -mtime +14 -delete
```

- [ ] **Step 2: Configure an off-VPS destination with rclone**

```bash
sudo apt install -y rclone
rclone config   # set up a remote named "hostinger-backup" — e.g. Backblaze B2 free tier (10GB) is enough for this DB size
```

- [ ] **Step 3: Schedule it nightly**

```bash
crontab -e
# add:
0 3 * * * /opt/supabase/backup/pg_backup.sh >> /var/log/pg_backup.log 2>&1
```

- [ ] **Step 4: Verify the backup pipeline works end-to-end**

```bash
sudo -u deploy /opt/supabase/backup/pg_backup.sh
ls -la /opt/supabase/backup/dumps/           # expect today's .sql.gz, non-zero size
rclone ls hostinger-backup:pharmshift-db-backups   # expect the same file listed remotely
```

- [ ] **Step 5: Set up an external uptime check**

Register `https://db.yourdomain.com/rest/v1/` with a free monitor (e.g. UptimeRobot), 5-minute interval, alert to your email on failure.

- [ ] **Step 6: Verify alerting actually fires**

```bash
docker compose -f /opt/supabase/docker-compose.yml stop kong
# wait for the next monitor check + alert email
docker compose -f /opt/supabase/docker-compose.yml start kong
```

Confirm you received a "down" alert and then an "up" recovery alert.

No repo changes in this task.

---

### Task 7: Cutover — real dump, restore, verify (maintenance window)

**Files:** Local machine (temporary): `full_dump.sql` (not committed — delete after use, it contains real production data).

**Interfaces:**
- Consumes: `SUPABASE_DB_URL` (Supabase Cloud), the VPS stack from Tasks 2–6.
- Produces: the VPS Postgres holding a byte-for-byte copy of production data as of the dump timestamp, verified by row-count parity, ready for Task 8 to point the live app at.

This is the one irreversible-feeling step — everything before it was rehearsal on disposable data. Pick a low-traffic window (late night, Bangkok time) and tell staff not to use the app during it — the app has no built-in maintenance-mode flag, and building one is out of scope for a one-time cutover.

- [ ] **Step 1: Announce the window and stop writes**

Confirm no one is actively using the app (check Vercel/Supabase logs for recent activity), then proceed.

- [ ] **Step 2: Take the real dump — schema and data together, in one file**

Doing schema and data in a single dump (rather than replaying migrations for schema, then a separate data-only restore) avoids "relation already exists" collisions and guarantees the schema matches the data exactly as it exists right now:

```bash
pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges -f full_dump.sql
```

- [ ] **Step 3: Sanity-check the dump before touching the VPS**

```bash
ls -la full_dump.sql                    # should be non-trivial size, not 0 bytes
grep -c "^COPY " full_dump.sql          # should be > 0 (one COPY block per table with data)
```

- [ ] **Step 4: Wipe the rehearsal schema on the VPS**

```bash
ssh deploy@<vps-ip> 'docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c \
  "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
```

- [ ] **Step 5: Restore the real dump**

```bash
scp full_dump.sql deploy@<vps-ip>:/tmp/
ssh deploy@<vps-ip> 'docker compose -f /opt/supabase/docker-compose.yml exec -T db psql -U postgres -f /tmp/full_dump.sql'
```

- [ ] **Step 6: Recreate the realtime publication**

Dropping `public` also dropped the tables the publication referenced — recreate it against the restored tables:

```bash
ssh deploy@<vps-ip> 'docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c \
  "DROP PUBLICATION IF EXISTS supabase_realtime; CREATE PUBLICATION supabase_realtime FOR TABLE shifts, swap_requests, notifications;"'
```

- [ ] **Step 7: Verify row-count parity against the source**

Run the same query against both databases and diff the results (should match exactly, since no writes happened between Step 2 and now):

```bash
for T in users shifts swap_requests notifications holidays audit_logs shift_logs push_subscriptions; do
  echo -n "$T source: "; psql "$SUPABASE_DB_URL" -tAc "SELECT count(*) FROM $T"
  echo -n "$T   vps: "; ssh deploy@<vps-ip> "docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -tAc \"SELECT count(*) FROM $T\""
done
```

Every pair must be identical. If any table diverges, stop — do not proceed to Task 8 — and re-run from Step 2.

- [ ] **Step 8: Restart the stack cleanly**

```bash
ssh deploy@<vps-ip> 'docker compose -f /opt/supabase/docker-compose.yml restart db rest realtime'
```

- [ ] **Step 9: Delete the local dump files (they contain real PII/health-scheduling data)**

```bash
rm full_dump.sql schema_only.sql 2>/dev/null || true
```

No repo changes in this task.

---

### Task 8: Point production at the new backend

**Files:**
- Modify: Vercel project env vars (Production environment) — not a repo file, managed via Vercel dashboard or CLI.
- Modify (optional): `vercel.json`

**Interfaces:**
- Consumes: the verified VPS backend from Task 7.
- Produces: the live production app reading/writing the VPS Postgres.

- [ ] **Step 1: Update Production env vars in Vercel**

Via dashboard (Project Settings → Environment Variables → Production) or CLI:

```bash
vercel env rm NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# paste: https://db.yourdomain.com

vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# paste: <ANON_KEY>

vercel env rm SUPABASE_SERVICE_ROLE_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
# paste: <SERVICE_ROLE_KEY>
```

- [ ] **Step 2 (optional): Pin the Vercel function region near the VPS**

Every server-side query now crosses the public internet to the VPS instead of talking to Supabase's edge network — pinning the function region to wherever the Hostinger datacenter is (assumed Singapore, `sin1`) reduces added latency:

`vercel.json`:

```json
{
  "functions": {
    "app/api/cron/**": {
      "maxDuration": 60
    }
  },
  "regions": ["sin1"]
}
```

```bash
git add vercel.json
git commit -m "Pin function region near self-hosted DB"
```

- [ ] **Step 3: Redeploy production**

```bash
vercel --prod
```

- [ ] **Step 4: Verify production against real data**

Log in with a real (non-test) account and confirm:
- The current month's calendar shows the same shifts as before cutover
- Creating a real swap request and accepting it works, notification arrives
- No errors in `vercel logs --prod` or `docker compose logs` on the VPS

- [ ] **Step 5: Monitor closely for the first hour**

Watch `vercel logs --prod` and `docker compose -f /opt/supabase/docker-compose.yml logs -f` on the VPS during the first hour of real traffic (morning shift-reminder cron at 06:00 Bangkok is a good early test of the service-role path working end-to-end).

---

### Task 9: Post-cutover safety window and decommission

**Files:** None — operational/documentation step.

**Interfaces:**
- Consumes: a stable production run on the VPS backend from Task 8.
- Produces: a documented, time-boxed rollback option, followed by clean decommissioning of the old Supabase project.

- [ ] **Step 1: Keep the old Supabase project alive but untouched for 14 days**

Do not delete or pause it yet — it's the rollback target. Do not write to it either (the app is now fully pointed at the VPS).

- [ ] **Step 2: Document the rollback procedure and its limit, explicitly**

Rollback = reverting the same 3 env vars from Task 8 Step 1 back to the old Supabase values and redeploying. This is only a clean rollback **before** meaningful new writes have landed on the VPS DB — after real shifts/swaps have been created against the VPS, rolling back means losing them. If a problem surfaces more than a day or two after cutover, the fix is forward (fix the VPS issue), not backward.

- [ ] **Step 3: After 14 days with no incidents, downgrade the old Supabase project**

Pause it (don't delete yet) as a read-only historical archive.

- [ ] **Step 4: After a further 30 days, take a final export and delete the Supabase project**

```bash
pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges -f pharmshift-final-supabase-archive.sql.gz
```

Store this final archive alongside the regular off-VPS backups from Task 6, then delete the Supabase Cloud project.

- [ ] **Step 5: Clean up staging artifacts**

```bash
rm .env.staging.local
```

(Leave the `.gitignore` entry in place — harmless, and useful if a staging file is ever needed again.)

---

## Self-Review Notes

- **Spec coverage**: VPS provisioning ✓ (Task 1), stack deploy trimmed to actually-used services ✓ (Task 2), schema validated before real data touched ✓ (Task 3), TLS ✓ (Task 4), full-app smoke test before cutover ✓ (Task 5), off-VPS backups + monitoring in place *before* cutover ✓ (Task 6), point-in-time cutover with row-count verification ✓ (Task 7), production switch-over ✓ (Task 8), time-boxed rollback + decommission ✓ (Task 9).
- **Realtime risk**: given its own explicit verification gate in Task 3 Step 6 (not just "container is up") per the highest-risk-piece call-out, re-verified in Task 5 and Task 8.
- **Dump-vs-replay**: resolved by using a live schema-only dump for rehearsal (Task 3) and a single combined schema+data dump for the real cutover (Task 7) — no migration-replay-order ambiguity, no two-dump collision.
- **JWT keys**: Task 2 Step 3 mints real signed JWTs rather than reusing Supabase Cloud's opaque keys, which would not validate against a self-hosted `JWT_SECRET`.
