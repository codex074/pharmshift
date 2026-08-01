# แผนย้าย PharmShift ไป Self-Host เต็มรูปแบบ (แอป + ฐานข้อมูล) บน VPS ของตัวเอง

> **สำหรับ agent ที่จะรันแผนนี้:** ต้องใช้สกิล superpowers:subagent-driven-development (แนะนำ) หรือ superpowers:executing-plans เพื่อทำงานทีละ Task ตามลำดับ ใช้ checkbox (`- [ ]`) ในการ track ความคืบหน้า

**เป้าหมาย:** ย้ายทั้งแอป Next.js และฐานข้อมูล (Supabase self-hosted) ออกจาก Vercel + Supabase Cloud ไปรันบน VPS เครื่องเดียวของตัวเอง (Ubuntu 24.04 LTS) เปิดทำงาน 24 ชม. โดยแอปรันเป็น Docker container, deploy อัตโนมัติผ่าน GitHub Actions ทุกครั้งที่ push ขึ้น `main`

**สถาปัตยกรรม:** VPS เครื่องเดียวรันทุกอย่างผ่าน Docker: (1) ชุด self-hosted Supabase แบบย่อ (`db` + `rest` + `realtime` + `kong`) (2) แอป Next.js ที่ build เป็น standalone Docker image (3) Caddy เป็น reverse proxy ตัวเดียวที่หน้าเซิร์ฟเวอร์ คอย route โดเมนแอปไปที่ container แอป (port 3000) และโดเมนฐานข้อมูลไปที่ Kong (port 8000) พร้อมออก TLS ให้อัตโนมัติ ทุก container bind เฉพาะ `127.0.0.1` ไม่เปิดออกอินเทอร์เน็ตตรงๆ, ufw เปิดแค่ 22/80/443 GitHub Actions ทำหน้าที่ CI/CD: push → SSH เข้า VPS → `git pull` + `docker compose build` + `up -d`

**เทคโนโลยีหลัก:** Ubuntu 24.04 LTS, Docker + Docker Compose, `supabase/docker` (official self-host compose), Caddy (reverse proxy + auto TLS), GitHub Actions (`appleboy/ssh-action` สำหรับ deploy), Next.js `output: 'standalone'`, `pg_dump`/`psql` สำหรับย้ายข้อมูล

## Global Constraints

- **VPS เครื่องเดียวรันทั้งแอปและฐานข้อมูล** — ตามที่ยืนยันแล้ว ไม่แยกเครื่อง
- **แอปรันเป็น Docker container** — ไม่ใช้ PM2/systemd ตรงๆ กับ Node
- **Deploy ผ่าน GitHub Actions CI/CD** — push ขึ้น `main` แล้ว deploy อัตโนมัติ ไม่ต้อง SSH เข้าไปสั่งเองทุกครั้ง
- **โค้ดแอป (`app/`, `lib/`, `hooks/`, `components/`) ไม่ต้องแก้ logic ใดๆ** — มีแก้แค่ 2 จุดที่จำเป็นทางเทคนิคสำหรับ containerize: เพิ่ม `output: 'standalone'` ใน `next.config.mjs` และลบ `vercel.json` (ไม่ใช้ Vercel แล้ว)
- **ไม่มี Supabase Auth, ไม่มี Supabase Storage ในระบบ** — ยืนยันแล้วจาก grep repo (auth เป็น custom JWT ทั้งหมดใน `lib/session.ts`) ชุด self-host จึงตัด `auth`/`storage`/`imgproxy`/`studio`/`analytics` ออกได้
- **ต้องมี 5 RPC functions ในฐานข้อมูลใหม่**: `accept_swap_request_atomic`, `apply_admin_shift_changes_atomic`, `apply_shift_owner_edits_atomic`, `cleanup_swap_request_chain_hops`, `record_access` — มากับ pg_dump อัตโนมัติ ไม่ต้องเขียนเอง
- **ต้องมี 3 Realtime channels ทำงานได้**: `shifts-${monthYear}`, `swaps-${userId}`, `notifs-${userId}` — ต้องเปิด `wal_level=logical` และสร้าง publication `supabase_realtime` ครอบตาราง `shifts`, `swap_requests`, `notifications`
- **ตัวแปร `NEXT_PUBLIC_*` ถูกฝังเข้า client bundle ตอน build เท่านั้น** — ต้องส่งเป็น Docker build args ตอน `docker compose build`, ไม่ใช่แค่ runtime env
- **Container ทุกตัว bind เฉพาะ `127.0.0.1`** — Postgres, PostgREST, Realtime, Kong, และแอป Next.js ห้ามเปิดพอร์ตออกอินเทอร์เน็ตตรงๆ ต้องผ่าน Caddy เท่านั้น
- **Cutover ข้อมูลจริงเป็นจุดตัดครั้งเดียว (point-in-time), ไม่ใช่ live migration** — งานเขียนเข้า Supabase Cloud หลังเริ่ม dump จะหายไป ต้องมี maintenance window
- **Backup ต้องอยู่นอก VPS** — ดิสก์ VPS พังต้องไม่ทำให้ backup หายไปด้วย
- **สเปก VPS ที่สมมติไว้**: Hostinger KVM 2 ขึ้นไป — 2 vCPU / 8GB RAM / Ubuntu 24.04 LTS, ดิสก์ว่าง ≥ 40GB (ยืนยัน/อัปเกรดก่อน Task 1 ถ้ายังไม่ได้เช่า)
- **Rollback สะอาดเฉพาะก่อนมีข้อมูลใหม่เขียนลง VPS** — หลัง cutover จริงแล้ว การย้อนกลับไปใช้ Vercel/Supabase Cloud หมายถึงข้อมูลใหม่ที่เขียนบน VPS จะหายไป
- **Egress ไม่ได้หายไป แค่ย้ายที่** — ทราฟฟิกฐานข้อมูลจะไปกินโควตา bandwidth ของ VPS แทน Supabase ต้องเช็คแพ็กเกจ VPS ว่าเพียงพอ

---

## File Structure

**บน VPS (ไม่อยู่ใน git):**
- `/opt/supabase/docker-compose.yml`, `/opt/supabase/.env` — ชุด self-hosted Supabase
- `/opt/pharmshift/` — repo ที่ clone มา, มี `.env` (secrets ทั้งหมด, chmod 600, ไม่ commit)
- `/etc/caddy/Caddyfile` — reverse proxy 2 โดเมน
- `/opt/backup/pg_backup.sh` — script backup รายวัน

**ใน repo `pharmshift` (แก้ไข/เพิ่มไฟล์เหล่านี้):**
- `next.config.mjs` (แก้ไข) — เพิ่ม `output: 'standalone'`
- `Dockerfile` (ใหม่) — multi-stage build สำหรับแอป
- `.dockerignore` (ใหม่) — กัน `node_modules`, `.next`, `.git` เข้า build context
- `.github/workflows/deploy.yml` (ใหม่) — CI/CD deploy ไป VPS
- `vercel.json` (ลบ) — ไม่ใช้ Vercel แล้ว
- `.github/workflows/cron.yml` (ไม่แก้ไฟล์ แก้แค่ค่า secret `APP_URL` ใน GitHub settings)

---

### Task 1: เตรียม VPS + ติดตั้งซอฟต์แวร์พื้นฐาน (Docker, Caddy, ufw)

**Files:** ไม่มีในโค้ด — ทำบน VPS ผ่าน SSH ทั้งหมด

**Interfaces:**
- Consumes: การเช่า VPS Ubuntu 24.04 LTS จาก Hostinger, IP + root SSH access
- Produces: VPS ที่มี user `deploy`, Docker + Compose plugin, Caddy, firewall เปิดเฉพาะ 22/80/443, swap file กันสำรอง — พร้อมให้ Task 2 กับ Task 6 เอาไป deploy ต่อ

- [ ] **Step 1: เช็คสเปกเครื่อง**

```bash
ssh root@<vps-ip>
lsb_release -a          # ต้องได้ Ubuntu 24.04 LTS
nproc                    # ต้อง >= 2
free -h                  # ต้อง >= 8Gi (ต่ำสุดรับได้ 4Gi)
df -h /                  # ต้องว่าง >= 40G
```

ถ้า RAM ต่ำกว่า 4GB ให้หยุดแล้วอัปเกรดแพ็กเกจ VPS ก่อน — Postgres + PostgREST + Realtime + Kong + การ build Next.js พร้อมกันจะไม่พอ

- [ ] **Step 2: สร้าง swap file กันสำรอง (สำคัญ เพราะจะ build Next.js บนเครื่องนี้ด้วย)**

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h   # ต้องเห็น Swap: 2.0Gi
```

- [ ] **Step 3: สร้าง user `deploy` (ไม่ใช้ root ทำงานประจำ)**

```bash
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

- [ ] **Step 4: สร้าง SSH key แยกสำหรับ GitHub Actions deploy (คนละคีย์กับที่ใช้ล็อกอินเอง)**

```bash
su - deploy
ssh-keygen -t ed25519 -f ~/.ssh/gh_deploy_key -N "" -C "github-actions-deploy"
cat ~/.ssh/gh_deploy_key.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/gh_deploy_key       # เก็บ private key นี้ไว้ — จะเอาไปใส่ GitHub Secret VPS_SSH_KEY ใน Task 7
```

- [ ] **Step 5: ติดตั้ง Docker + Compose plugin**

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
systemctl enable docker   # ให้ Docker เปิดเองตอนเครื่อง reboot
```

- [ ] **Step 6: ติดตั้ง Caddy**

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

- [ ] **Step 7: ตั้งค่า firewall — เปิดเฉพาะ 22/80/443**

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Postgres (5432), PostgREST (3000 ภายใน), Realtime (4000), Kong (8000), และแอป Next.js (3000) จะไม่เปิดที่นี่เลย — เข้าถึงได้เฉพาะผ่าน `127.0.0.1` + Caddy เท่านั้น

- [ ] **Step 8: ตรวจสอบทั้งหมด**

```bash
su - deploy
docker run hello-world       # ต้องเห็น "Hello from Docker!"
caddy version                # ต้องขึ้นเวอร์ชัน ไม่ error
sudo ufw status verbose      # ต้องเห็นแค่ 22,80,443/tcp ALLOW Anywhere
```

- [ ] **Step 9: Commit — ไม่มีอะไรใน repo ต้อง commit ใน task นี้ (ข้ามได้)**

---

### Task 2: Deploy ชุด self-hosted Supabase แบบย่อ (db + rest + realtime + kong)

**Files:** VPS: `/opt/supabase/docker-compose.yml`, `/opt/supabase/.env`

**Interfaces:**
- Consumes: Docker จาก Task 1
- Produces: `db`, `rest`, `realtime`, `kong` รันอยู่ที่ `http://127.0.0.1:8000` บน VPS พร้อม `ANON_KEY`/`SERVICE_ROLE_KEY` คู่ใหม่

- [ ] **Step 1: ดึง compose file ต้นฉบับจาก Supabase**

```bash
su - deploy
mkdir -p /opt/supabase && cd /opt/supabase
git clone --depth 1 https://github.com/supabase/supabase.git supabase-src
cp -r supabase-src/docker/* .
cp .env.example .env
rm -rf supabase-src
```

- [ ] **Step 2: สร้าง secret จริง**

```bash
POSTGRES_PW=$(openssl rand -hex 24)
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${POSTGRES_PW}/" .env

JWT_SECRET=$(openssl rand -hex 32)
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
echo "JWT_SECRET=${JWT_SECRET}"   # เก็บไว้ใช้ต่อ Step 3
```

- [ ] **Step 3: สร้าง ANON_KEY / SERVICE_ROLE_KEY เป็น JWT เซ็นด้วย JWT_SECRET**

Key เดิมจาก Supabase Cloud ใช้กับ stack นี้ไม่ได้ ต้องเซ็นใหม่:

```bash
npm install --no-save jsonwebtoken
node -e '
const jwt = require("jsonwebtoken");
const secret = process.argv[1];
const iat = 1799000000;
const exp = iat + 10 * 365 * 24 * 3600;
for (const role of ["anon", "service_role"]) {
  console.log(role, jwt.sign({ role, iss: "supabase", iat, exp }, secret));
}
' "$JWT_SECRET"
```

```bash
sed -i "s/^ANON_KEY=.*/ANON_KEY=<วางค่า anon token>/" .env
sed -i "s/^SERVICE_ROLE_KEY=.*/SERVICE_ROLE_KEY=<วางค่า service_role token>/" .env
```

- [ ] **Step 4: ตัด service ที่ไม่ใช้ออกจาก `docker-compose.yml`**

ลบ/comment block: `auth`, `storage`, `imgproxy`, `studio`, `meta`, `functions` — เก็บไว้แค่ `db`, `rest`, `realtime`, `kong`

แอปนี้ไม่เคยเปิด connection ตรงไปที่ Postgres (ใช้ `@supabase/supabase-js` คุยผ่าน PostgREST/Realtime ทาง HTTP/WS เท่านั้น) จึงตัด **`supavisor`** (connection pooler) ทิ้งได้เลย — ไม่มีอะไรในระบบนี้ใช้มัน และการตัดทิ้งยังลดจำนวน secret ที่ต้องหมุน (`SECRET_KEY_BASE`, `VAULT_ENC_KEY` ฯลฯ) ด้วย

**สำคัญ — อย่าตัด `analytics` กับ `vector` ทิ้ง แม้จะไม่ได้ใช้งานจริง:** compose file ต้นฉบับผูก `depends_on: { analytics: service_healthy }` ไว้ใน `rest`, `realtime`, `kong`, `meta` และ `db` มักผูกกับ `vector` — ถ้าลบ service block ของ `analytics`/`vector` แต่ไม่ลบ `depends_on` ที่ชี้มาด้วย service ที่เหลือจะสตาร์ทไม่ขึ้นเลย (Docker Compose validate ไม่ผ่าน) มี 2 ทางเลือก:
  - **(แนะนำ) เก็บ `analytics` และ `vector` ไว้เฉยๆ** — กิน RAM เพิ่มราว 200-300MB แต่ไม่ต้องไปไล่แก้ dependency graph ให้เสี่ยง error บนระบบที่จะรันจริง
  - หรือถ้าจะตัดจริงๆ ต้องเปิดไฟล์ `docker-compose.yml` แล้ว **ลบทุก `depends_on` key ที่ชี้ไปหา `analytics`/`vector`** ออกจาก service ที่เหลือด้วย ไม่ใช่แค่ลบ service block เฉยๆ

แก้ `kong.yml` ลบ route ที่ชี้ไป service ที่ตัดออกจริง (เช่น `/auth/v1`, `/storage/v1`) — ถ้า Kong ไม่ยอมสตาร์ทให้เช็ค `docker compose logs kong` จะบอกว่า service ไหนหาไม่เจอ

- [ ] **Step 5: บังคับให้ทุก port bind เฉพาะ `127.0.0.1`**

ใน `docker-compose.yml` ของ Supabase หา mapping port ของ `kong` (ปกติ `8000:8000` และ `8443:8443`) แก้เป็น:

```yaml
    ports:
      - "127.0.0.1:8000:8000"
```

- [ ] **Step 6: สตาร์ท stack**

```bash
docker compose up -d
docker compose ps    # ทุก service ต้องขึ้น "Up" หรือ "healthy"
```

- [ ] **Step 7: ตรวจสอบ PostgREST ผ่าน Kong**

```bash
curl -s http://127.0.0.1:8000/rest/v1/ \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>"
```

ต้องได้ JSON กลับมา ไม่ใช่ connection refused หรือ Kong 502

ไม่มีอะไรใน repo `pharmshift` ต้อง commit — `.env` อยู่บน VPS เท่านั้น ห้าม commit secret เด็ดขาด

---

### Task 3: ทดสอบ schema migration บนข้อมูลจำลอง + ยืนยัน RPC และ Realtime

**Files:** เครื่อง local ชั่วคราว: `schema_only.sql` (ไม่ commit ลบทิ้งหลังใช้)

**Interfaces:**
- Consumes: `SUPABASE_DB_URL` (connection string ตรงจาก Supabase Cloud dashboard → Project Settings → Database), stack จาก Task 2
- Produces: ฐานข้อมูลบน VPS ที่มี schema ครบ (ยังไม่มีข้อมูลจริง) พิสูจน์แล้วว่าใช้กับ PostgREST + Realtime ได้จริง ก่อนแตะข้อมูลจริงใน Task 9

- [ ] **Step 1: Dump schema จริงจาก Supabase Cloud (ไม่เอาข้อมูล)**

```bash
pg_dump "$SUPABASE_DB_URL" --schema-only --schema=public --no-owner --no-privileges -f schema_only.sql
```

- [ ] **Step 2: ใส่เข้า Postgres บน VPS**

```bash
scp schema_only.sql deploy@<vps-ip>:/tmp/
ssh deploy@<vps-ip> 'docker compose -f /opt/supabase/docker-compose.yml exec -T db psql -U postgres -f /tmp/schema_only.sql'
```

- [ ] **Step 3: คืนสิทธิ์ (GRANT) ให้ role ที่ PostgREST ใช้ — ขาดไม่ได้**

`pg_dump --no-privileges` (Step 1) ตัด `GRANT` ทั้งหมดออกจาก dump โดยตั้งใจ ตารางที่ import เข้ามาจะไม่มีสิทธิ์ให้ role `anon`/`authenticated`/`service_role` เลย ถ้าข้ามขั้นนี้ PostgREST จะตอบ `permission denied for table ...` ทุก endpoint ทันที (RLS `using(true)` ช่วยไม่ได้เพราะ grant ถูกเช็คก่อน RLS เสมอ):

```bash
ssh deploy@<vps-ip>
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
"
```

- [ ] **Step 4: เปิด logical replication + สร้าง publication สำหรับ Realtime**

```bash
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "ALTER SYSTEM SET wal_level = logical;"
docker compose -f /opt/supabase/docker-compose.yml restart db
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c \
  "CREATE PUBLICATION supabase_realtime FOR TABLE shifts, swap_requests, notifications;"
```

- [ ] **Step 5: เช็คว่า 5 RPC functions มาครบ**

```bash
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "\df accept_swap_request_atomic"
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "\df apply_admin_shift_changes_atomic"
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "\df apply_shift_owner_edits_atomic"
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "\df cleanup_swap_request_chain_hops"
docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "\df record_access"
```

ทุกตัวต้องเจอ signature ของ function ไม่ใช่ "Did not find any function"

- [ ] **Step 6: เช็คว่า grant ใน Step 3 ได้ผลจริง ก่อนไปทดสอบ Realtime**

```bash
curl -s http://127.0.0.1:8000/rest/v1/holidays?select=* -H "apikey: <ANON_KEY>"
```

ต้องได้ `[]` (array ว่าง) ไม่ใช่ `{"message":"permission denied for table holidays", ...}` — ถ้ายังเจอ permission denied ให้กลับไปรัน Step 3 ใหม่

- [ ] **Step 7: ทดสอบ Realtime end-to-end (จุดเสี่ยงที่สุด ห้ามข้าม)**

Kong ผูกไว้แค่ `127.0.0.1:8000` (Step 5 ของ Task 2) และ ufw ปิดพอร์ต 8000 จากภายนอก ดังนั้นเครื่อง local เข้าตรงๆ ไม่ได้ — ให้เปิด SSH tunnel มาก่อน:

```bash
ssh -L 8000:127.0.0.1:8000 deploy@<vps-ip>
```

เปิด terminal ใหม่อีกอันไว้ (tunnel ข้างบนต้องค้างไว้ตลอด) แล้วรันจาก local Node REPL โดยชี้ไปที่ `http://127.0.0.1:8000` (ผ่าน tunnel ไม่ใช่ยิงตรง `<vps-ip>`):

```js
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('http://127.0.0.1:8000', '<ANON_KEY>');
supabase
  .channel('test-notifs')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
    console.log('REALTIME EVENT RECEIVED:', payload);
  })
  .subscribe((status) => console.log('subscribe status:', status));
```

ระหว่างรัน ให้ insert แถวจากอีก terminal (terminal ที่ 3):

```bash
ssh deploy@<vps-ip> 'docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c \
  "INSERT INTO notifications (user_id, type, title, body) VALUES (gen_random_uuid(), '\''test'\'', '\''hi'\'', '\''hi'\'');"'
```

ต้องเห็น `REALTIME EVENT RECEIVED: ...` ขึ้นภายในไม่กี่วินาที ถ้าไม่มา เช็ค `docker compose logs realtime` หา replication slot error ก่อนไปต่อ

ไม่มีการแก้ repo `pharmshift` ใน task นี้

---

### Task 4: Reverse proxy + TLS สำหรับ 2 โดเมน (แอป + ฐานข้อมูล) ด้วย Caddy

**Files:** VPS: `/etc/caddy/Caddyfile`

**Interfaces:**
- Consumes: DNS A record 2 ตัว ชี้มาที่ IP ของ VPS: โดเมนแอป (เช่น `app.yourdomain.com`) และโดเมนฐานข้อมูล (เช่น `db.yourdomain.com`)
- Produces: ทั้งสองโดเมนใช้ HTTPS อัตโนมัติ ชี้เข้า container ที่ถูกต้อง โดยพอร์ต 3000/8000 ไม่ต้องเปิดออกอินเทอร์เน็ตเลย

- [ ] **Step 1: ตั้งค่า DNS**

เพิ่ม A record 2 รายการที่ผู้ให้บริการโดเมน: `app.yourdomain.com` → `<vps-ip>` และ `db.yourdomain.com` → `<vps-ip>` รอ propagate (`dig app.yourdomain.com` ต้องได้ IP ของ VPS)

- [ ] **Step 2: เขียน Caddyfile**

`/etc/caddy/Caddyfile`:

```
app.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}

db.yourdomain.com {
    reverse_proxy 127.0.0.1:8000
}
```

```bash
sudo systemctl reload caddy
```

Caddy จะขอใบรับรอง Let's Encrypt ให้อัตโนมัติตอนมี request แรกเข้ามา และต่ออายุเองตลอด

- [ ] **Step 3: ตรวจสอบ HTTPS ของฝั่งฐานข้อมูล (แอปยังไม่มี container ให้ทดสอบจนกว่าจะถึง Task 6)**

```bash
curl -s https://db.yourdomain.com/rest/v1/holidays?select=* -H "apikey: <ANON_KEY>" -v 2>&1 | grep -E "SSL|HTTP/2 200"
```

ต้องเห็น TLS handshake สำเร็จและ `HTTP/2 200` กับ body `[]`

ไม่มีการแก้ repo ใน task นี้

---

### Task 5: เตรียมโค้ดแอปให้ containerize ได้ (Dockerfile + standalone output)

**Files:**
- Modify: `next.config.mjs`
- Create: `Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: โค้ด Next.js ปัจจุบัน (14.2.5, App Router)
- Produces: Docker image ขนาดเล็ก (standalone build) ที่ Task 6/7 เอาไป build+รันบน VPS ได้

- [ ] **Step 1: เปิด standalone output ใน `next.config.mjs`**

แก้ `next.config.mjs` เพิ่ม `output: 'standalone'` (จำเป็นสำหรับ deploy แบบ Docker — ไม่งั้น image จะพก `node_modules` ทั้งหมดซึ่งใหญ่และช้ากว่ามาก):

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

(ส่วนอื่นในไฟล์เหมือนเดิมทั้งหมด แก้แค่เพิ่มบรรทัด `output: 'standalone',`)

- [ ] **Step 2: สร้าง `.dockerignore`**

```
node_modules
.next
.git
.env*.local
*.md
docs/
```

- [ ] **Step 3: สร้าง `Dockerfile` (multi-stage build)**

```dockerfile
# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN npm run build

# ---- runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

`HOSTNAME=0.0.0.0` เป็นบรรทัดที่พลาดง่ายที่สุด — ไม่ใส่แล้ว Next.js standalone server จะ bind กับ `localhost` **ภายใน** container เท่านั้น ทำให้ `docker run -p 127.0.0.1:3000:3000` เข้าไม่ถึงเลย (connection refused จากข้างนอก แม้ container จะรันอยู่ก็ตาม)

หมายเหตุ: `ARG`/`ENV` ตรงนี้จำเป็นเฉพาะตัวแปรที่ขึ้นต้น `NEXT_PUBLIC_` (ถูกฝังเข้า client bundle ตอน build) ตัวแปรลับอื่นๆ (`SESSION_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`)**ไม่ต้อง**ใส่ตรงนี้ — จะส่งเป็น runtime env ตอนรัน container ใน Task 6 แทน เพื่อไม่ให้ secret ฝังอยู่ใน image layer

- [ ] **Step 4: ทดสอบ build image บนเครื่อง local**

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://db.yourdomain.com \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY> \
  --build-arg NEXT_PUBLIC_VAPID_PUBLIC_KEY=<vapid public key> \
  --build-arg NEXT_PUBLIC_APP_URL=https://app.yourdomain.com \
  -t pharmshift:test .
```

Expected: build จบโดยไม่ error, จบด้วย `=> => naming to docker.io/library/pharmshift:test`

- [ ] **Step 5: Commit**

```bash
git add next.config.mjs Dockerfile .dockerignore
git commit -m "Add Docker standalone build for self-hosted deployment"
```

---

### Task 6: ตั้ง docker-compose บน VPS สำหรับรันแอป + ทดสอบรันจริงครั้งแรก

**Files:** VPS: `/opt/pharmshift/docker-compose.yml`, `/opt/pharmshift/.env`

**Interfaces:**
- Consumes: Dockerfile จาก Task 5, ชุด Supabase จาก Task 2, Caddyfile จาก Task 4
- Produces: แอป Next.js รันอยู่ที่ `127.0.0.1:3000` บน VPS พร้อมให้ Caddy proxy ออกไปที่ `app.yourdomain.com`

- [ ] **Step 1: Clone repo ขึ้น VPS**

```bash
su - deploy
mkdir -p /opt/pharmshift && cd /opt/pharmshift
git clone <URL ของ repo pharmshift บน GitHub> .
```

- [ ] **Step 2: สร้าง `.env` บน VPS (secret ทั้งหมด ไม่ commit เข้า git)**

```bash
cat > /opt/pharmshift/.env <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://db.yourdomain.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY จาก Task 2>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY จาก Task 2>
SESSION_JWT_SECRET=<คัดลอกค่าเดิมจาก Vercel env>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<คัดลอกค่าเดิมจาก Vercel env>
VAPID_PRIVATE_KEY=<คัดลอกค่าเดิมจาก Vercel env>
VAPID_SUBJECT=mailto:pharmacy@hospital.go.th
CRON_SECRET=<คัดลอกค่าเดิมจาก Vercel env>
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
EOF
chmod 600 /opt/pharmshift/.env
```

ค่า `SESSION_JWT_SECRET`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `CRON_SECRET` ต้อง **คัดลอกค่าเดิมที่ตั้งไว้บน Vercel มาใส่ตรงๆ** (จาก Vercel dashboard → Environment Variables) **ห้ามสุ่มค่าใหม่** — โดยเฉพาะ `SESSION_JWT_SECRET`: ถ้าใส่ค่าใหม่ ผู้ใช้ทุกคนจะถูกเด้งออกจากระบบทันทีที่ cutover เพราะ JWT เดิมที่ browser ถืออยู่จะ verify ไม่ผ่าน

- [ ] **Step 3: เขียน `docker-compose.yml` ของแอป**

`/opt/pharmshift/docker-compose.yml`:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: ${NEXT_PUBLIC_VAPID_PUBLIC_KEY}
        NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL}
    image: pharmshift-app:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    env_file:
      - .env
```

`docker compose` จะโหลดไฟล์ `.env` ในโฟลเดอร์เดียวกันอัตโนมัติทั้งสำหรับ `${...}` substitution ตอน build และ `env_file` สำหรับ runtime — ไม่ต้องตั้งชื่อไฟล์อื่น

- [ ] **Step 4: Build + รันครั้งแรกด้วยมือ**

```bash
cd /opt/pharmshift
docker compose build app
docker compose up -d app
docker compose ps    # ต้องขึ้น "Up"
```

- [ ] **Step 5: ตรวจสอบแอปตอบสนองภายในเครื่อง**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login
```

ต้องได้ `200`

- [ ] **Step 6: ตรวจสอบผ่านโดเมนจริง (ผ่าน Caddy)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://app.yourdomain.com/login
```

ต้องได้ `200` — ถ้าได้ 502 ให้เช็ค `docker compose logs app` และ `sudo journalctl -u caddy -n 50`

- [ ] **Step 7: ตรวจสอบว่า server-side ของแอปคุยกับฐานข้อมูลได้จริง (ไม่ใช่แค่ client-side)**

เพราะทั้งแอปและฐานข้อมูลอยู่เครื่องเดียวกัน แต่ยังตั้งใจให้ทุกการเชื่อมต่อ (รวมถึงฝั่ง server ของแอปเอง) วิ่งผ่านโดเมนสาธารณะ `https://db.yourdomain.com` เพื่อไม่ต้องแก้โค้ด — จุดนี้มีความเสี่ยงว่า VPS/เครือข่ายของผู้ให้บริการบางเจ้าไม่รองรับ "hairpin NAT" (แพ็กเก็ตที่ยิงออกไป public IP ของตัวเองแล้ววนกลับเข้ามา) ถ้าเกิดปัญหานี้ฝั่ง client จะดูปกติแต่ทุก API route ฝั่ง server จะ timeout หรือ error แปลกๆ ให้ทดสอบ endpoint ที่ต้องใช้ `SUPABASE_SERVICE_ROLE_KEY` ฝั่ง server ก่อนไปต่อ:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://app.yourdomain.com/api/auth/me
```

ต้องได้ `200` หรือ `401` (ทั้งคู่แปลว่า route ทำงาน แค่ยังไม่มี session) **ไม่ใช่** `500`/timeout ถ้าเจอ 500/timeout ให้เช็ค `docker compose -f /opt/pharmshift/docker-compose.yml logs app` หา error ประเภท `ETIMEDOUT`/`ECONNREFUSED` ที่ชี้ไป `db.yourdomain.com` — ถ้าเจอจริง ทางแก้คือให้ container ของแอปคุยกับ Kong ผ่าน docker network ภายในแทนการวนออกอินเทอร์เน็ต: เพิ่ม `db.yourdomain.com` ให้เป็น network alias ของ service `kong` ใน `/opt/supabase/docker-compose.yml` (เพิ่ม `networks: { <shared-network>: { aliases: [db.yourdomain.com] } }` ใต้ service `kong`) แล้วให้ทั้งสอง compose stack (Task 2 กับ Task 6) join `<shared-network>` เดียวกัน (สร้างด้วย `docker network create <shared-network>` แล้วเพิ่ม `networks: default: external: true; name: <shared-network>` ในทั้งสองไฟล์) — เมื่อ container ของแอป resolve `db.yourdomain.com` จะได้ IP ภายใน docker network แทนที่จะวนออกอินเทอร์เน็ต โดยไม่ต้องแก้โค้ดแอปเลยสักบรรทัด

- [ ] **Step 8: เปิดเบราว์เซอร์ทดสอบ manual สั้นๆ**

เข้า `https://app.yourdomain.com` ตรวจว่าหน้า login โหลดขึ้น ไม่มี error ใน console เกี่ยวกับ mixed-content หรือ CORS (ตอนนี้ยังล็อกอินไม่ได้จริงเพราะฐานข้อมูลยังไม่มีข้อมูล — จะทดสอบเต็มรูปแบบใน Task 9)

ไม่มีการ commit ใน task นี้ — `.env` และ `docker-compose.yml` (ของแอป) อยู่บน VPS ไม่เข้า git

---

### Task 7: ตั้งค่า GitHub Actions CI/CD สำหรับ deploy อัตโนมัติ

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: SSH key จาก Task 1 Step 4, VPS ที่มีแอป container รันอยู่แล้วจาก Task 6
- Produces: ทุกครั้งที่ push ขึ้น `main` (หรือกด run เอง) แอปบน VPS จะ build ใหม่และ restart อัตโนมัติ

- [ ] **Step 1: เพิ่ม GitHub Secrets**

ไปที่ repo settings → Secrets and variables → Actions → เพิ่ม:
- `VPS_HOST` = `<vps-ip>`
- `VPS_USER` = `deploy`
- `VPS_SSH_KEY` = private key จาก Task 1 Step 4 (`~/.ssh/gh_deploy_key` เนื้อหาทั้งไฟล์)

- [ ] **Step 2: เขียน workflow**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -e
            cd /opt/pharmshift
            git fetch origin main
            git reset --hard origin/main
            docker compose build app
            docker compose up -d app
            docker image prune -f

      - name: Health check
        run: |
          sleep 5
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://app.yourdomain.com/login)
          echo "HTTP Status: $STATUS"
          if [ "$STATUS" -ne 200 ]; then
            echo "❌ Deploy health check failed"
            exit 1
          fi
          echo "✅ Deploy succeeded"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Actions CI/CD deploy to self-hosted VPS"
```

- [ ] **Step 4: ทดสอบ push จริง**

```bash
git push origin main
```

ไปดูที่ GitHub → Actions tab → ต้องเห็น workflow `Deploy to VPS` รันจนจบสีเขียว (ทั้ง step SSH deploy และ health check)

- [ ] **Step 5: ทดสอบแก้โค้ดเล็กน้อยแล้ว push ดู deploy จริง**

แก้ข้อความอะไรก็ได้ที่ไม่กระทบ logic (เช่น comment) → commit → push → ยืนยันว่าเว็บ `https://app.yourdomain.com` อัปเดตตามหลัง Action รันจบ

---

### Task 8: Backup ฐานข้อมูลนอกเครื่อง + uptime monitoring (ทำก่อนย้ายข้อมูลจริง)

**Files:** VPS: `/opt/backup/pg_backup.sh`, crontab

**Interfaces:**
- Consumes: `db` container จาก Task 2
- Produces: backup รายคืนที่เก็บนอก VPS + alert เมื่อเว็บ/ฐานข้อมูลล่ม ต้องมีให้เสร็จก่อน Task 9 ที่จะเอาข้อมูลจริงเข้ามา

- [ ] **Step 1: เขียน backup script**

`/opt/backup/pg_backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date +%F)
LOCAL_DIR=/opt/backup/dumps
REMOTE=hostinger-backup:pharmshift-db-backups

mkdir -p "$LOCAL_DIR"
docker compose -f /opt/supabase/docker-compose.yml exec -T db \
  pg_dump -U postgres --schema=public --no-owner --no-privileges \
  | gzip > "$LOCAL_DIR/pharmshift-${STAMP}.sql.gz"

rclone copy "$LOCAL_DIR/pharmshift-${STAMP}.sql.gz" "$REMOTE"

find "$LOCAL_DIR" -name "pharmshift-*.sql.gz" -mtime +14 -delete
```

```bash
chmod +x /opt/backup/pg_backup.sh
```

- [ ] **Step 2: ติดตั้งและตั้งค่า rclone ไปที่เก็บนอก VPS**

```bash
sudo apt install -y rclone
rclone config   # ตั้ง remote ชื่อ "hostinger-backup" เช่น Backblaze B2 free tier (10GB) พอสำหรับฐานข้อมูลนี้
```

- [ ] **Step 3: ตั้ง cron รายคืน**

```bash
crontab -e
# เพิ่ม:
0 3 * * * /opt/backup/pg_backup.sh >> /var/log/pg_backup.log 2>&1
```

- [ ] **Step 4: ทดสอบ backup pipeline ทั้งสาย**

```bash
sudo -u deploy /opt/backup/pg_backup.sh
ls -la /opt/backup/dumps/                          # ต้องเห็นไฟล์วันนี้ ขนาดไม่เป็น 0
rclone ls hostinger-backup:pharmshift-db-backups   # ต้องเห็นไฟล์เดียวกันอยู่ฝั่ง remote ด้วย
```

- [ ] **Step 5: ตั้ง uptime monitor ภายนอก**

ลงทะเบียน `https://app.yourdomain.com` และ `https://db.yourdomain.com/rest/v1/` กับ UptimeRobot (ฟรี) ทุก 5 นาที ตั้ง alert ทาง email

- [ ] **Step 6: ทดสอบว่า alert ทำงานจริง**

```bash
docker compose -f /opt/pharmshift/docker-compose.yml stop app
# รอ monitor เช็ครอบถัดไป + alert เข้า
docker compose -f /opt/pharmshift/docker-compose.yml start app
```

ต้องได้รับ alert "down" ตามด้วย "up" กลับมา

---

### Task 9: Cutover ข้อมูลจริง (maintenance window)

**Files:** เครื่อง local ชั่วคราว: `full_dump.sql` (ไม่ commit ลบทิ้งหลังใช้ มีข้อมูลจริง)

**Interfaces:**
- Consumes: `SUPABASE_DB_URL` (Supabase Cloud), VPS stack จาก Task 2–8
- Produces: ฐานข้อมูลบน VPS มีข้อมูลจริงครบเหมือน Supabase Cloud ณ เวลา dump ยืนยันด้วย row count ให้ตรงกัน

เป็นขั้นที่รู้สึกย้อนกลับไม่ได้มากที่สุด — ก่อนหน้านี้ทั้งหมดคือซ้อมกับข้อมูลจำลอง เลือกช่วงเวลาที่คนใช้น้อย (ดึกๆ เวลาไทย) แจ้งเจ้าหน้าที่ล่วงหน้าว่าห้ามใช้แอปช่วงนี้ (แอปยังไม่มี maintenance-mode flag ในตัว)

- [ ] **Step 1: ประกาศ maintenance window และหยุดการเขียนข้อมูล**

เช็ค log ของ Supabase/Vercel ว่าไม่มีคนใช้งานอยู่จริง

- [ ] **Step 2: Dump ข้อมูลจริง (schema+data พร้อมกันไฟล์เดียว)**

```bash
pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges -f full_dump.sql
```

- [ ] **Step 3: เช็คไฟล์ dump ก่อนเอาขึ้น VPS**

```bash
ls -la full_dump.sql              # ต้องมีขนาด ไม่ใช่ 0 byte
grep -c "^COPY " full_dump.sql    # ต้อง > 0
```

- [ ] **Step 4: ล้าง schema ทดลองบน VPS**

```bash
ssh deploy@<vps-ip> 'docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c \
  "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
```

- [ ] **Step 5: Restore ข้อมูลจริง**

```bash
scp full_dump.sql deploy@<vps-ip>:/tmp/
ssh deploy@<vps-ip> 'docker compose -f /opt/supabase/docker-compose.yml exec -T db psql -U postgres -f /tmp/full_dump.sql'
```

- [ ] **Step 6: คืนสิทธิ์ (GRANT) ให้ role ที่ PostgREST ใช้ — เหมือน Task 3 Step 3 เป๊ะ**

`DROP SCHEMA public CASCADE` (Step 4) ล้าง grant ที่ตั้งไว้ตอนซ้อมทิ้งหมด ต้องรันซ้ำอีกครั้งกับ schema ที่เพิ่ง restore มาจริง:

```bash
ssh deploy@<vps-ip> 'docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c "
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
"'
```

- [ ] **Step 7: สร้าง publication ใหม่ (หายไปตอน DROP SCHEMA)**

```bash
ssh deploy@<vps-ip> 'docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -c \
  "DROP PUBLICATION IF EXISTS supabase_realtime; CREATE PUBLICATION supabase_realtime FOR TABLE shifts, swap_requests, notifications;"'
```

- [ ] **Step 8: เทียบ row count ให้ตรงกับต้นทาง**

```bash
for T in users shifts swap_requests notifications holidays audit_logs shift_logs push_subscriptions; do
  echo -n "$T source: "; psql "$SUPABASE_DB_URL" -tAc "SELECT count(*) FROM $T"
  echo -n "$T   vps: "; ssh deploy@<vps-ip> "docker compose -f /opt/supabase/docker-compose.yml exec db psql -U postgres -tAc \"SELECT count(*) FROM $T\""
done
```

ทุกคู่ต้องเท่ากันเป๊ะ ถ้าไม่ตรงห้ามไป Task 10 — ให้เริ่มใหม่จาก Step 2

- [ ] **Step 9: Restart stack ให้เรียบร้อย**

```bash
ssh deploy@<vps-ip> 'docker compose -f /opt/supabase/docker-compose.yml restart db rest realtime'
```

- [ ] **Step 10: ทดสอบแอปจริงกับข้อมูลจริง (ผ่าน `app.yourdomain.com`)**

ล็อกอินด้วย user จริง 1 คน ตรวจว่าปฏิทินเดือนปัจจุบันขึ้นเวรตรงกับของเดิม, realtime ต่อได้ (Network tab เห็น websocket ไป `db.yourdomain.com`)

- [ ] **Step 11: ลบไฟล์ dump ในเครื่อง local (มีข้อมูลส่วนบุคคล/สุขภาพจริง)**

```bash
rm full_dump.sql schema_only.sql 2>/dev/null || true
```

---

### Task 10: สลับ production ให้ชี้มาที่ VPS จริง + อัปเดต cron

**Files:**
- Delete: `vercel.json`
- ไม่แก้ `.github/workflows/cron.yml` — แก้แค่ค่า GitHub Secret `APP_URL`

**Interfaces:**
- Consumes: แอป+ฐานข้อมูลที่ทดสอบผ่านแล้วจาก Task 9
- Produces: ผู้ใช้จริงทั้งหมดเข้าที่ `https://app.yourdomain.com` แทน `*.vercel.app`, cron ยิงไปที่โดเมนใหม่, Vercel เลิกใช้งาน

- [ ] **Step 1: อัปเดต DNS โดเมนหลักที่ผู้ใช้เข้าจริง**

ถ้าโดเมนที่ผู้ใช้คุ้นเคย (เช่น `pharmshift.yourdomain.com` หรือโดเมนหลักของหน่วยงาน) เป็นคนละตัวกับ `app.yourdomain.com` ที่ตั้งไว้ใน Task 4 ให้ทำอย่างใดอย่างหนึ่ง:
- แก้ A record ของโดเมนที่ผู้ใช้เข้าจริงให้ชี้มาที่ `<vps-ip>` แล้วเพิ่ม block เดียวกันใน Caddyfile, หรือ
- ประกาศให้ผู้ใช้เปลี่ยนไปเข้า `app.yourdomain.com` โดยตรง

- [ ] **Step 2: อัปเดต GitHub Secret `APP_URL` ให้ cron ยิงไปที่โดเมนใหม่**

ไปที่ repo settings → Secrets and variables → Actions → แก้ `APP_URL` เป็น `https://app.yourdomain.com` (`.github/workflows/cron.yml` อ่านค่านี้อยู่แล้ว ไม่ต้องแก้ไฟล์ workflow)

- [ ] **Step 3: ทดสอบ cron ยิงเข้าโดเมนใหม่จริง**

ไปที่ GitHub Actions → workflow "Cron Jobs" → กด "Run workflow" แบบ manual (`job: reminders`) → ดู log ต้องได้ `HTTP Status: 2xx`

- [ ] **Step 4: ลบ `vercel.json` และปิด/ลบโปรเจกต์ Vercel**

```bash
git rm vercel.json
git commit -m "Remove Vercel config after full self-host migration"
git push origin main
```

ไปที่ Vercel dashboard → หยุด auto-deploy ของโปรเจกต์ (หรือ pause) — **ยังไม่ต้องลบโปรเจกต์เลย** เก็บไว้เป็น rollback target ตาม Task 11

- [ ] **Step 5: ยืนยันว่า Vercel cron ซ้ำ (R5 เดิม) หายไปเองแล้ว**

เพราะไม่มี deployment บน Vercel วิ่งอยู่แล้ว → cron scheduler เหลือแค่ตัวเดียวคือ GitHub Actions โดยอัตโนมัติ ไม่ต้องแก้อะไรเพิ่ม

- [ ] **Step 6: เฝ้าดูใกล้ชิด 1 ชั่วโมงแรก**

```bash
ssh deploy@<vps-ip> 'docker compose -f /opt/pharmshift/docker-compose.yml logs -f app'
```

พร้อมเปิดอีก terminal ดู `docker compose -f /opt/supabase/docker-compose.yml logs -f` คู่กัน โดยเฉพาะช่วง cron แจ้งเตือนเวรรอบถัดไป (06:00 หรือ 16:00 เวลาไทย) เป็นจุดทดสอบ end-to-end ที่ดีของ service-role path

---

### Task 11: ช่วงเวลาระวังหลัง cutover + decommission Vercel/Supabase Cloud

**Files:** ไม่มี — ขั้นตอนปฏิบัติการ/เอกสารล้วนๆ

**Interfaces:**
- Consumes: production ที่รันนิ่งบน VPS จาก Task 10
- Produces: rollback window ที่มีกำหนดเวลาชัดเจน แล้วปิด Supabase Cloud + Vercel อย่างเป็นระบบ

- [ ] **Step 1: เก็บ Supabase Cloud project และ Vercel project ไว้เฉยๆ 14 วัน**

ห้ามลบ ห้าม pause ทันที — เป็นเป้าหมาย rollback ถ้าเกิดปัญหา ห้ามเขียนข้อมูลใหม่เข้า Supabase Cloud อีก (แอปชี้ไป VPS เต็มตัวแล้ว)

- [ ] **Step 2: เขียนบันทึกขั้นตอน rollback และขีดจำกัดของมันไว้ชัดเจน**

Rollback = สลับ DNS โดเมนแอปกลับไปที่ Vercel + เปลี่ยน 3 env var (`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY`) กลับเป็นค่า Supabase Cloud เดิม แล้ว redeploy — ใช้ได้สะอาดเฉพาะ**ก่อน**มีการเขียนข้อมูลจริงลง VPS หลัง Task 10 ถ้าปัญหาเกิดขึ้นหลังผ่านไปเกิน 1-2 วัน ทางแก้คือแก้ไปข้างหน้าบน VPS ไม่ใช่ถอยกลับ

- [ ] **Step 3: ผ่านไป 14 วันไม่มีปัญหา → downgrade โปรเจกต์ Supabase Cloud**

Pause ไว้เป็น read-only archive (ยังไม่ลบ)

- [ ] **Step 4: ผ่านไปอีก 30 วัน → export ครั้งสุดท้ายแล้วลบโปรเจกต์ Supabase Cloud**

```bash
pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges | gzip > pharmshift-final-supabase-archive.sql.gz
```

เก็บไฟล์นี้ไว้คู่กับ backup รายวันจาก Task 8 แล้วค่อยลบโปรเจกต์ Supabase Cloud

- [ ] **Step 5: ลบโปรเจกต์ Vercel**

หลังมั่นใจว่า VPS เสถียรดีแล้ว (แนะนำรอครบ 30 วันเดียวกับ Step 4) ลบโปรเจกต์ Vercel ทิ้งได้ — ตอนนี้ deploy ทั้งหมดมาจาก GitHub Actions ไป VPS แล้ว Vercel ไม่มีบทบาทอะไรเหลืออยู่

---

## Self-Review Notes

- **ครอบคลุม spec ครบ**: VPS + ติดตั้งซอฟต์แวร์เสริม (Task 1), self-hosted DB (Task 2-3), TLS 2 โดเมน (Task 4), containerize + deploy โค้ดแอป (Task 5-7), backup/monitoring ก่อนแตะข้อมูลจริง (Task 8), cutover ข้อมูลจริง (Task 9), สลับ production + cron (Task 10), rollback window + decommission (Task 11)
- **NEXT_PUBLIC_* build-time**: ระบุชัดเจนใน Global Constraints และ Task 5/6/7 ว่าต้องส่งเป็น build arg ไม่ใช่แค่ runtime env — จุดพลาดที่พบบ่อยที่สุดตอน containerize แอป Next.js
- **Secret ไม่ฝังใน image**: Dockerfile Task 5 รับเฉพาะ `NEXT_PUBLIC_*` เป็น build arg ส่วน secret จริง (`SESSION_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`) ส่งผ่าน `env_file` ตอน runtime ใน Task 6 เท่านั้น
- **R5 (cron ซ้ำ) แก้เองอัตโนมัติ**: เพราะ Vercel เลิกใช้ทั้งระบบ ไม่ใช่แค่ปิด cron ฝั่งเดียว — ระบุไว้ชัดใน Task 10 Step 5
- **Rollback มีขีดจำกัดชัดเจน**: ย้ำ 2 รอบ (Global Constraints และ Task 11) ว่าใช้ได้เฉพาะก่อนมีข้อมูลใหม่บน VPS ไม่ให้เข้าใจผิดว่า rollback ฟรีตลอดไป
- **Type/naming consistency**: ชื่อโดเมน `app.yourdomain.com` / `db.yourdomain.com`, ชื่อไฟล์ `.env`, `docker-compose.yml`, secret names (`VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY`, `ANON_KEY`/`SERVICE_ROLE_KEY`) ใช้ตรงกันทุก task ที่อ้างถึง
- **แก้ไขหลังตรวจทานรอบ 2 (จุดที่จะทำให้ execution หยุดจริง หากไม่แก้)**:
  1. Task 2 Step 4 — ตัด `supavisor` ทิ้ง (ไม่มีใครใช้), เตือนไม่ให้ตัด `analytics`/`vector` เพราะ `depends_on` ของ service อื่นผูกกับมันอยู่ ตัดแล้ว compose จะ start ไม่ขึ้น
  2. Task 3 Step 3 และ Task 9 Step 6 — เพิ่ม `GRANT`/`ALTER DEFAULT PRIVILEGES` ให้ role `anon`/`authenticated`/`service_role` หลัง restore ทุกครั้ง เพราะ `pg_dump --no-privileges` ตัด grant ทิ้งหมด ไม่ทำ PostgREST จะตอบ permission denied ทุก endpoint
  3. Task 3 Step 7 — ทดสอบ Realtime ผ่าน SSH tunnel (`ssh -L 8000:127.0.0.1:8000`) แทนการยิงตรงไป `<vps-ip>:8000` เพราะพอร์ตนั้นถูก ufw ปิดและ Kong bind แค่ `127.0.0.1`
  4. Task 5 Step 3 — เพิ่ม `ENV HOSTNAME=0.0.0.0` ใน Dockerfile runner stage ไม่งั้น Next.js standalone server จะ bind แค่ localhost ในคอนเทนเนอร์ ทำให้ port publish ออกมาใช้ไม่ได้
  5. Task 6 Step 7 — เพิ่มการทดสอบว่า server-side ของแอปคุยกับฐานข้อมูลผ่านโดเมนสาธารณะได้จริง (ไม่ใช่แค่ client-side) พร้อม fallback ด้วย docker network alias ถ้า VPS ไม่รองรับ hairpin NAT
  6. Task 6 Step 2 — แก้ placeholder `<openssl rand -base64 64>` ที่ทำให้เข้าใจผิดว่าต้องสุ่มค่าใหม่ ให้ตรงกับคำอธิบายที่ถูกต้องคือคัดลอกค่าเดิมจาก Vercel
