# Deploying coboard

The app is two deployables:

| Part | Directory | What it is | Host it on |
|---|---|---|---|
| Web | `web/` | Next.js frontend | Vercel (or Netlify) |
| API | `server/` | Express + Socket.IO + MongoDB | Railway / Render / Fly.io — anything with a **persistent Node process**. Not serverless: Socket.IO needs a long-lived server. |

Deploy the **API first** (the web build needs its URL), then the web, then point the API back at the web's URL.

---

## 1. MongoDB Atlas

- In **Network Access**, allow the API host's outbound IPs. Railway/Render use dynamic IPs, so in practice this means `0.0.0.0/0` (allow from anywhere) — safe as long as the database user has a strong password, but prefer a static IP/private networking if your plan has it.
- Use a dedicated database user for production.

## 2. API server (`server/`)

Build command: `npm run build` &nbsp;·&nbsp; Start command: `npm start` &nbsp;·&nbsp; Health check path: `/health`

Environment variables (all **required** in production — the server exits with a clear error if one is missing):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` — switches cookies to `Secure; SameSite=None`. Railway sets this automatically; verify on other hosts. |
| `MONGODB_URI` | Atlas connection string |
| `JWT_SECRET` | Long random string. **Generate a fresh one for production** — don't reuse the dev value. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLIENT_ORIGIN` | The web app's exact origin, e.g. `https://coboard.vercel.app` — no trailing slash |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Real SMTP creds. Without them the mailer silently falls back to Ethereal (emails never delivered). |
| `MAIL_FROM` | e.g. `"coboard" <no-reply@yourdomain.com>` |

`PORT` is injected by the platform — the server already reads it.

## 3. Web app (`web/`)

On Vercel: set **Root Directory** to `web`. Build/output settings are auto-detected.

Environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SERVER_URL` | The API's public URL, e.g. `https://coboard-api.up.railway.app` — no trailing slash |

`NEXT_PUBLIC_*` vars are inlined **at build time** — changing it requires a redeploy, not just a restart.

## 4. Close the loop

After the web app has its final URL, set `CLIENT_ORIGIN` on the API to that exact origin and redeploy the API. Until this matches, browsers block every credentialed request (CORS) and the socket handshake.

## 5. Post-deploy smoke test

1. `https://<api>/health` returns `{"ok":true}`.
2. Sign up → DevTools → Application → Cookies: `token` cookie shows **Secure** and **SameSite=None**.
3. Open a board in two browsers → live cursors + drawing sync (Socket.IO over the cross-site cookie).
4. Log out → cookie is actually gone.
5. Forgot password → email arrives (real SMTP, not an Ethereal preview URL in the server logs).
6. Six rapid failed logins → the sixth-through-tenth still respond, the eleventh returns 429.

## Local dev — unchanged

`npm run dev` in both `server/` and `web/`. Cookies stay `SameSite=Lax` without `Secure` (required on plain-HTTP localhost); missing SMTP falls back to Ethereal preview URLs; `CLIENT_ORIGIN` defaults to `http://localhost:3000`.

## Security posture notes

- **Security headers.** The API sends hardening headers via `helmet` (and hides `X-Powered-By`); the web app sends `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS, and `Permissions-Policy` from `next.config.ts`. A full **Content-Security-Policy is not yet configured** on the web app (it needs per-request nonce plumbing for Next's inline scripts) — tracked as a follow-up.
- **CSRF.** In production the auth cookie is `SameSite=None` (frontend and API are on different domains), so it rides cross-site requests. State-changing requests are protected in depth by three layers: (1) they require `application/json`, which forces a CORS preflight that the single-origin policy blocks; (2) `DELETE`/`PATCH` are non-simple methods that always preflight; and (3) an explicit server-side check rejects any mutating request whose `Origin` header doesn't match `CLIENT_ORIGIN`. If you add an endpoint that accepts a simple content-type (form-encoded/text), rely on layer 3 — don't remove it.

## Known advisories (watch items)

- **postcss (moderate) via Next.** `npm audit` reports a moderate postcss XSS-in-stringify advisory pulled in transitively by Next. The affected range includes every Next up to `16.3.0-canary.5`, so the current latest **stable** (16.2.10, which we're on) does not clear it — the first fixed version is **16.3.0 stable, not yet released**. It is not exploitable here (Next runs postcss only at build time on our own CSS, never on untrusted input). **Action:** bump Next to `16.3.0` once it ships stable. Do **not** run `npm audit fix --force` (it would downgrade Next to 9.x and break the app), and do not ship a canary/preview to production.
