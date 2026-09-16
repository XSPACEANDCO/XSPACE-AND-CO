# Xspace Portal — API

Express + Postgres backend for the portal. It enforces the five-role access
model server-side and serves the built React app from the same origin, so
Render only needs one service.

## Deploying to Render

### 1. Push this repo to GitHub

Render deploys from a Git remote. Make sure `server/.env` is **not** committed
(it is gitignored).

### 2. New → Blueprint

Point it at the repo and apply. `render.yaml` at the root creates:

- a **Web Service** that builds the frontend and runs the API
- a **free Postgres** database, with `DATABASE_URL` wired between them
- a generated `JWT_SECRET`

### 3. Set three environment variables before the first deploy

In the service's **Environment** tab:

| Key | Value |
|---|---|
| `BOOTSTRAP_EMAIL` | your real email, e.g. `tej@xspace.co` |
| `BOOTSTRAP_PASSWORD` | a strong password, 12+ characters |
| `BOOTSTRAP_NAME` | your name |

This is how the first Founder gets created — see the next section for why.

`SEED_DEMO` is already `"false"` in the blueprint, so **no demo accounts are
created in production**.

### 4. Deploy, then sign in

Open the service URL, sign in with `BOOTSTRAP_EMAIL` / `BOOTSTRAP_PASSWORD`,
**change your password**, then go back to the Environment tab and clear
`BOOTSTRAP_PASSWORD`. Leaving it set is harmless — bootstrap never touches an
account that already exists — but there is no reason to keep a password in an
environment variable.

### Free-tier caveats

- The service **sleeps after 15 minutes idle**; the next request takes ~30s.
- Free Postgres **expires** after a limited period. Render emails you first.
- The filesystem is **ephemeral** and there is **no shell**. Nothing is written
  to disk — `media.url` stores a URL, not bytes. Wire S3 or Cloudinary before
  accepting real uploads.

---

## Where the data actually lives

`DATABASE_URL` decides, and it takes two shapes.

| | Where it runs | Who sets `DATABASE_URL` |
|---|---|---|
| Local | an embedded Postgres writing to `server/.data/` on your machine | nobody - `file:./.data/xspace` is the default |
| Local, alternative | a Postgres server you run, or Render's *External* URL | you, in `server/.env` (gitignored) |
| Render | a managed Postgres service Render provisions | Render, automatically |

The local default is **PGlite**: real Postgres compiled to WebAssembly, keeping
its data in a folder instead of listening on a port. Nothing to install or
start, the same SQL as the server version, and the accounts you create while
testing are still there after a restart. `server/.data/` is gitignored - it
holds real password hashes and belongs on your disk, not in the repo.

**In production the database is never part of this repo.** It is a separate
Postgres *service* that the app talks to over the network. A `file:` URL is
refused at startup when `NODE_ENV=production`, because Render replaces the
instance's disk on every deploy and the accounts would vanish with it.

The `databases:` block in `render.yaml` is what creates the managed one. Render
stands it up as its **own service**, separate from the web service, and injects
the connection string. You never type it in and it is never committed.

### What a deploy does to your data

Nothing. Pushing to Git replaces the *application*; the database is a different
service and keeps its rows. Concretely, on every boot:

- `migrate()` runs `schema.sql`, which is all `CREATE TABLE IF NOT EXISTS` and
  `ADD COLUMN IF NOT EXISTS` — safe to re-run, never drops anything.
- the demo seed is **skipped** (`SEED_DEMO` is `false` in production), and even
  when enabled it exits early if any user exists.
- `bootstrapFounder()` skips any address that already exists.

So a redeploy cannot wipe users, reset a password, or re-grant a role.

### Free-tier realities

- Free Postgres **expires**. Render emails you the date. When it goes, the data
  goes — upgrade the database or dump and restore before then.
- There are **no automatic backups** on the free plan. Take your own:
  ```bash
  # "External Database URL" from the Render dashboard
  pg_dump "postgresql://user:pass@host/db" > backup-$(date +%F).sql
  psql "postgresql://..." < backup-2026-09-16.sql   # restore
  ```
- The **web service** disk is ephemeral and irrelevant — nothing is written
  there. That is why `media.url` stores a link rather than bytes.
- Deleting the web service does not delete the database, and vice versa. They
  are billed and deleted separately.

---

## How accounts get created

**There is no public sign-up.** Nobody creates their own account. Someone
above them creates it, sets or generates a password, and hands both over.
Login is the only unauthenticated endpoint in the whole API.

### The hierarchy

| Who you are | Accounts you can create |
|---|---|
| **Founder** | everyone — Founder, Core, Realtor, Creator, Studio |
| **Core Team** | partners only — Realtor, Creator, Studio |
| **Realtor / Creator / Studio** | nobody |

Declared in one place, `CAN_CREATE_ROLES` in [`src/rbac.js`](src/rbac.js):

```js
export const CAN_CREATE_ROLES = {
  founder: ['founder', 'core', 'realtor', 'creator', 'studio'],
  core:    ['realtor', 'creator', 'studio'],
  realtor: [], creator: [], studio: [],
};
```

That table is also the password-reset rule: **you can reset a password for any
role you could have created.** So Core looks after partners day to day, and
only a Founder can touch a Core account.

To let a partner role onboard others, add roles to its row. Nothing else needs
to change.

### Day one

A fresh deployment has **exactly one account: the Founder**, created from
`BOOTSTRAP_EMAIL` / `BOOTSTRAP_PASSWORD` (see below). From there:

1. Founder signs in, changes the password, clears `BOOTSTRAP_PASSWORD`.
2. Founder creates the Core team — up to `MAX_INTERNAL_ACCOUNTS` (10) internal
   accounts including themselves.
3. Founder or Core create agent and creator accounts and hand out credentials.

If the database has no users and no bootstrap variables are set, the server
starts but prints a loud warning — nobody can sign in and every
account-creating endpoint needs a Founder token, so there is no way back in
without setting them.

### Creating one

```http
POST /api/users
Authorization: Bearer <founder or core token>

{
  "name": "Sai Kumar",
  "email": "sai@xspace.co",
  "role": "realtor",
  "password": "SaiStart2026!",     // optional — omitted means one is generated
  "phone": "9000011111",
  "areas": "Tellapur, Nallagandla"
}
```

The response hands the password back **once**, for you to pass on:

```json
{
  "user": { "id": "u_...", "email": "sai@xspace.co", "must_change_password": true },
  "password": "SaiStart2026!",
  "note": "Give these to them directly. They must change the password on first login."
}
```

Only the bcrypt hash is stored, so the password cannot be looked up later. If
it is lost, reset it rather than trying to recover it.

### From the portal

The usual way. Sign in and open the roster for the kind of account you are
creating - **Core Team** for Founder and Core, or **Creator / Realtor / Studio
Partners** for the rest - then **+ Add account**. The password appears once on
that screen with a copy button; send it over and they are made to replace it
the first time they sign in.

The role dropdown only offers what your own role may hand out, and the server
checks the same rule again, so a Core member poking at the API cannot create a
Founder.

### From the command line

```bash
npm run user -- create --email sai@xspace.co --name "Sai Kumar" --role realtor
```

### Forced password change on first login

The password you chose travelled to them over WhatsApp, email or a phone call.
That is fine for a handover and not fine as a permanent credential, so every
account created this way is flagged `must_change_password`.

Until they change it, their token can reach exactly two endpoints:
`GET /api/auth/me` and `POST /api/auth/change-password`. Everything else
returns:

```json
{ "error": "You must change your password before continuing",
  "code": "password_change_required" }
```

`POST /api/auth/change-password` clears the flag, and **the same token then
works** — no second login needed. Front ends should check `mustChangePassword`
in the login response and route to a change-password screen.

The bootstrap Founder is the one exception: they typed their own password into
the Render dashboard, so nobody else ever saw it.

### Resetting a forgotten password

```http
POST /api/users/:id/reset-password
{ "password": "optional-specific-one" }
```

Founder or Core, and Core cannot reset an internal account. Returns the new
password once and re-flags them to change it.

### Deactivating someone

`PATCH /api/users/:id` with `{ "active": false }` (Founder only). It takes
effect on their **next request** — `requireAuth` re-reads from the database
every call, so a live token stops working immediately. The last active Founder
cannot be deactivated or demoted.

### The internal cap

Founder + Core is capped at `MAX_INTERNAL_ACCOUNTS` active accounts (default
10). Creating or promoting past it returns 409 telling you to deactivate
someone or raise the limit. It is a guardrail against a mistake or a stolen
Founder token, **not a business rule** — raise it freely. Partner accounts are
not capped.

---

## Declaring access

Access is **code, not configuration** — it lives in a file, ships with a
deploy, and is reviewable in a diff. There is no admin screen for editing
permissions, deliberately: a bug in a permissions UI is a security incident.

### The one file that matters

`src/rbac.js`. Every module a role can reach is declared there:

```js
export const MODULES = {
  finances:      { roles: ['founder'] },
  verifications: { roles: ['founder', 'core'] },
  listings: {
    roles: ['founder', 'core', 'realtor'],
    scope: { founder: 'all', core: 'all', realtor: 'own' },
  },
};
```

- `roles` — who can reach the module at all. Enforced by `requireModule()`.
- `scope` — what they see inside it. `'all'` is every record, `'own'` is only
  their own. Enforced in the SQL `WHERE` clause of each route.

Writes are declared separately, because reading is not the same as changing:

```js
export const WRITE_RULES = {
  'listings:verify':  ['founder', 'core'],   // realtors cannot verify their own
  'commissions:pay':  ['founder'],
};
```

Enforced by `requirePermission('listings:verify')`.

### Worked example: let Core Team see Finances

1. Edit `src/rbac.js`:
   ```js
   finances: { roles: ['founder', 'core'] },
   ```
2. Mirror it in `../xspace-portal-react/src/lib/roleConfig.js` so the nav
   offers it:
   ```js
   { key: 'finances', label: '🏦 Finances', to: '/finances',
     roles: ['founder', 'core'], contents: [...] },
   ```
3. `npm run check:rbac` — fails if you only changed one of the two.
4. Commit and push. Render redeploys; the change is live for everyone's next
   request.

### Worked example: add a brand new module

1. Add it to `MODULES` in `src/rbac.js` with its `roles`.
2. Add the matching entry to `MODULES` in the frontend's `roleConfig.js`,
   including `to` (the route) and `contents` (what the placeholder page lists).
3. Gate the API routes with `requireModule('yourKey')`.
4. `npm run check:rbac`, commit, push.

The frontend picks up the route and sidebar entry automatically — `App.jsx`
generates a route per module and `Sidebar.jsx` renders from
`modulesForRole()`. Until you build a real screen, `ModulePage` renders a
placeholder that states who can reach it.

### Why the matrix exists twice

`server/src/rbac.js` is **authoritative** — it decides what a request may do.
`xspace-portal-react/src/lib/roleConfig.js` only decides what to paint; a
browser can edit it freely and gain nothing.

They still have to agree, or the UI offers buttons the API rejects. That is
what `npm run check:rbac` is for — it diffs roles *and* scopes and exits
non-zero on drift. **Run it in CI**, e.g. as part of the build command:

```
cd server && npm ci && npm run check:rbac && cd ../xspace-portal-react && npm ci && npm run build
```

## Running locally

```bash
npm install
npm start                # http://localhost:10000
```

No database to install: with `DATABASE_URL` unset the server runs an embedded
Postgres in `server/.data/`. Copy `.env.example` to `.env` when you want to
change the port, seed demo data, or point at a real Postgres instead.

Useful scripts:

```bash
npm run dev          # restarts on file change
npm run seed         # insert demo data (no-op if users exist)
npm run seed -- --force
npm run check:rbac   # fail if the frontend's access matrix has drifted
```

To develop the frontend against this API, leave `STATIC_DIR=` empty here and
set `VITE_API_URL=http://localhost:10000` in `xspace-portal-react/.env`.

## Security model

**The access matrix in `src/rbac.js` is the authoritative one.** The copy in
the frontend's `roleConfig.js` only decides what to paint; this one decides
what a request is allowed to do. `npm run check:rbac` fails the build if they
disagree — run it in CI.

Three layers, applied in this order:

1. `requireAuth` — validates the bearer token, then **re-reads the role from
   the database** rather than trusting the token. Changing or deactivating
   someone takes effect on their next request, not whenever their token
   happens to expire.
2. `requireModule('finances')` — can this role reach this module at all.
3. `requirePermission('commissions:pay')` — narrower than read access. Seeing
   the verification queue and clearing an item on it are separate rights.

Row scoping is done **in the WHERE clause**, never by filtering after the
query. A realtor partner's `GET /api/commissions` cannot return another
partner's row even if the response shaping is wrong.

Other choices worth knowing:

- Passwords are bcrypt, cost 12. Never logged, never returned — `publicUser()`
  strips the hash on the way out.
- Login is rate limited to 20 attempts per 15 minutes per IP.
- A wrong password and an unknown address return the identical error, so the
  endpoint can't be used to enumerate accounts.
- Fetching a record that exists but isn't yours returns **404, not 403** — a
  403 would confirm the record exists.
- Only a Founder can create Founder or Core accounts.
- You cannot deactivate your own account.

### Before this handles real data

- [ ] Change `SEED_PASSWORD` and force a reset on the demo accounts, or delete them
- [ ] Put a real password policy on `/api/auth/change-password` (currently 8+ chars)
- [ ] Add refresh tokens — the current token lives 12h with no revocation list
- [ ] Move file uploads to object storage; `media.url` is a bare string today
- [ ] Set `CORS_ORIGINS` if you split the frontend onto its own host
- [ ] Turn the helmet CSP back on (it is relaxed for the bundled SPA)

## API

All routes are under `/api`. Everything except `/api/health`,
`/api/meta/access` and `/api/auth/login` needs `Authorization: Bearer <token>`.

### Auth
| Method | Path | Who |
|---|---|---|
| POST | `/auth/login` | anyone — the only unauthenticated endpoint |
| GET | `/auth/me` | any signed-in user |
| POST | `/auth/change-password` | any signed-in user |

### Dashboard
| Method | Path | Who |
|---|---|---|
| GET | `/dashboard/snapshot` | all — cards differ per role |
| GET | `/dashboard/funnel` | all — scoped |
| GET | `/dashboard/activity` | all |
| GET | `/dashboard/audit` | founder |
| GET | `/dashboard/finances` | founder |
| GET | `/dashboard/notifications` | all |
| POST | `/dashboard/notifications/:id/read` | all |
| GET·POST | `/dashboard/area-updates` | realtor |

### Records
| Method | Path | Who |
|---|---|---|
| GET·POST | `/leads` | founder, core (all) · realtor, creator (own) |
| GET·PATCH | `/leads/:id` | same, scoped |
| DELETE | `/leads/:id` | founder, core |
| GET·POST | `/listings` | founder, core (all) · realtor (own) |
| POST | `/listings/:id/verify` | founder, core |
| GET·POST | `/projects` | founder, core, studio (all) · creator (upcoming) |
| GET·POST | `/visits` | founder, core (all) · realtor (own) |
| POST | `/visits/:id/complete` | founder, core, realtor |
| POST | `/visits/:id/unsuccessful` · `/reschedule` | founder, core |
| GET | `/verifications` | founder, core |
| POST | `/verifications/:id/start` · `/verify` · `/escalate` | founder, core |
| GET | `/verifications/export.csv` | founder, core |
| GET·POST | `/tickets` | all — partners see only their own |
| PATCH | `/tickets/:id` | founder, core |
| GET | `/commissions` | founder, core (all) · realtor, creator (own) |
| POST | `/commissions` · `/commissions/:id/pay` | founder |

### Media pipeline
| Method | Path | Who |
|---|---|---|
| POST | `/media` | creator, realtor, studio |
| GET | `/media/mine` | any uploader |
| GET | `/media/raw` | studio, founder, core |
| GET | `/media/library` | studio, founder, core |
| GET | `/media/pending` | studio |
| PATCH | `/media/:id/status` | studio, founder, core |

### Partners
| Method | Path | Who |
|---|---|---|
| GET | `/users/creators` · `/realtors` · `/studios` | founder, core |
| GET | `/users/team` | founder |
| GET | `/users/partner-dashboards` | founder, core |
| GET·PATCH | `/users/me/profile` | realtor, creator, studio |
| POST | `/users` | founder, core — core cannot create internal accounts |
| POST | `/users/:id/reset-password` | founder, core — core cannot reset internal |
| PATCH | `/users/:id` | founder |

## Demo accounts

All share `SEED_PASSWORD` (default `xspace123`).

| Email | Role |
|---|---|
| tej@xspace.co | Founder |
| karthik@xspace.co | Core Team |
| sai@xspace.co | Realtor Partner |
| priya@xspace.co | Creator Partner |
| studio@xspace.co | Xspace Studio |

## Wiring the frontend to it

The frontend still reads `localStorage` — it is the standalone demo until you
migrate it page by page. `xspace-portal-react/src/lib/api.js` is the client to
migrate onto. Login is the piece to do first:

```jsx
import api from '../lib/api';

async function handleSubmit(e) {
  e.preventDefault();
  try {
    const { user } = await api.auth.login(email, password);
    setRaw(KEYS.role, user.role);   // keep the rest of the UI working
    navigate('/dashboard');
  } catch (err) {
    alert(err.message);             // "Invalid email or password"
  }
}
```

After that, replace each page's seeded array with its `api.*` call — the field
names line up deliberately, except that the API is snake_case
(`assigned_to`, `created_at`) where the localStorage demo was camelCase.
