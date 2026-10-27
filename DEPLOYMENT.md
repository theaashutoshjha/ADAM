# ADAM-AR — Production Deployment & Operations Guide

## 1. Production Hardware & System Requirements

| Resource | Recommended Specification |
| :--- | :--- |
| **CPU** | 8 Cores (Intel Xeon or AMD EPYC) for high-throughput DSP & ASR concurrency |
| **RAM** | 16 GB - 32 GB ECC Memory |
| **Storage** | 500 GB NVMe SSD (High IOPS for SQLite WAL journal and audio recordings) |
| **Operating System** | Ubuntu Linux 22.04 LTS / 24.04 LTS or Windows Server 2022 |
| **Runtime** | Node.js `v20.12.0` or higher (`v22+` recommended) |
| **Media Tools** | FFmpeg `6.0+` installed and accessible in system `PATH` |

---

## 2. Environment Configuration Matrix (`.env`)

```env
# Application Server
PORT=3000
NODE_ENV=production
APP_URL=https://compliance.brokerage.com
JWT_SECRET=use-a-strong-random-64-character-hex-string

# Neural Speech ASR Engine Credentials
DEEPGRAM_API_KEY=your_production_deepgram_api_key
GEMINI_API_KEY=your_production_gemini_api_key
GROQ_API_KEY=your_production_groq_api_key

# Enterprise SMTP Dispatch
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@mg.brokerage.com
SMTP_PASS=your_smtp_password
DEFAULT_SENDER_EMAIL=compliance@brokerage.com
FATAL_CC_EMAIL=audit-escalations@brokerage.com

# Database Path (Optional override, defaults to .data/auditeq_production.db)
DB_PATH=/var/data/auditeq/auditeq_production.db
```

---

## 3. Production Build & Execution

### Building the Bundle
```bash
# 1. Install all dependencies (including Vite, esbuild, and TypeScript compiler)
npm ci

# 2. Run type checking and production build
npm run lint
npm run build

# 3. (Optional) Prune devDependencies for lightweight production deployment
npm prune --omit=dev
```

### Process Management with PM2
Create `ecosystem.config.cjs`:
```javascript
module.exports = {
  apps: [
    {
      name: 'adam-ar',
      script: 'dist/server.cjs',
      instances: 1, // Single instance required for SQLite WAL lock safety
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      max_memory_restart: '4G',
      exp_backoff_restart_delay: 100,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-err.log',
      out_file: './logs/pm2-out.log'
    }
  ]
};
```
Start service:
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

---

## 4. Nginx Reverse Proxy & SSL Configuration

```nginx
server {
    listen 80;
    server_name compliance.brokerage.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name compliance.brokerage.com;

    ssl_certificate /etc/letsencrypt/live/compliance.brokerage.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/compliance.brokerage.com/privkey.pem;

    client_max_body_size 500M; # Permits large batch ZIP audio uploads

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

---

## 5. Automated Database Backups & WAL Maintenance

To safely back up the SQLite database without locking active pipeline transactions, use the SQLite backup API or online vacuum into a backup file:

```bash
# Nightly backup cron script: /opt/scripts/backup-db.sh
DATE=$(date +%Y%m%d_%H%M%S)
sqlite3 /var/data/auditeq/auditeq_production.db ".backup /var/backups/auditeq/auditeq_backup_${DATE}.db"
gzip /var/backups/auditeq/auditeq_backup_${DATE}.db
find /var/backups/auditeq/ -type f -name "*.db.gz" -mtime +30 -delete
```

---

## 6. Cloudflare Deployment Architecture & Setup

### Architecture Overview

ADAM-AR requires a Node.js runtime (`>=20.12.0`, Node 22+ recommended) for its backend services due to:
- Native **SQLite WAL** database engine (`node:sqlite` `DatabaseSync`)
- Native **FFmpeg** audio processing and multi-channel DSP splitting
- Large audio ZIP file streaming and unzipping (`multer`, `adm-zip`)
- Background transcription worker queue processing

Because serverless edge environments (Cloudflare Pages Functions / Workers) run on lightweight V8 isolates without a local filesystem or Node C++ binaries, the application uses a **Decoupled Architecture**:

```
[Browser Client]
       │
       ▼
[Cloudflare Pages / Workers]  ──(Serves React SPA & Static Assets from /dist)
       │
       ├── /api/* requests proxied via _worker.js / [[catchall]].ts
       │
       ▼
[Node.js Backend Server]      ──(Express + SQLite WAL + Dual ASR + DSP)
 (VPS, Render, Railway, EC2, or Local + Cloudflare Tunnel)
```

---

### Deployment Methods

#### Method 1: Cloudflare Tunnel (Full-Stack Node.js Server — Most Streamlined)
Run the bundled Node.js server (`node dist/server.cjs`) on your server/VPS and expose it securely via Cloudflare Tunnel without opening firewall ports:
```bash
# 1. Install cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared.deb

# 2. Authenticate & create tunnel
cloudflared tunnel login
cloudflared tunnel create adam-tunnel

# 3. Route domain to local server port 3000
cloudflared tunnel route dns adam-tunnel compliance.brokerage.com

# 4. Run tunnel
cloudflared tunnel run --url http://localhost:3000 adam-tunnel
```

#### Method 2: Cloudflare Workers with Static Assets (`wrangler deploy`)
Deploy the frontend static assets and edge proxy directly using Wrangler:
1. Ensure your backend Node.js server is running and publicly reachable (e.g., `https://api.yourdomain.com`).
2. Set the `BACKEND_URL` environment variable:
   - In Cloudflare Dashboard: **Workers & Pages > adam > Settings > Variables** -> add `BACKEND_URL` = `https://api.yourdomain.com`.
   - Or in `.env` / Wrangler secrets: `npx wrangler secret put BACKEND_URL`.
3. Deploy:
   ```bash
   npm run build
   npx wrangler deploy
   ```
4. The included `dist/_worker.js` automatically proxies all `/api/*` calls (GET, POST, PUT, DELETE, OPTIONS) to your Node.js backend.

#### Method 3: Cloudflare Pages
If connected via Git to Cloudflare Pages:
1. **Build command**: `npm run build`
2. **Build output directory**: `dist`
3. In Cloudflare Pages Dashboard, navigate to **Settings > Environment variables**.
4. Add variable `BACKEND_URL` pointing to your deployed Node.js backend (e.g. `https://api.yourdomain.com`).
5. All `/api/*` requests will be proxied automatically via `_worker.js` / `functions/api/[[catchall]].ts`.

---

### In-App Backend Host Configuration (Instant Fallback)

If `BACKEND_URL` has not been set in Cloudflare environment variables:
1. Open the ADAM-AR Login Screen.
2. Click **"Configure Backend Server URL"** (or it auto-expands on connectivity errors).
3. Enter your backend host (e.g., `https://api.yourdomain.com` or local tunnel address).
4. Click **"Save & Test"**. The connection is tested against `/api/health` and saved in browser storage.

