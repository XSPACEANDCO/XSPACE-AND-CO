# Xspace & Co. Portal

Private portal for Xspace & Co. — five roles across four logins, covering
leads, listings, projects, site visits, verifications, commissions and the
media pipeline.

```
.
├── xspace-portal-react/   React (Vite) frontend  → its README
├── server/                Express + Postgres API → its README
├── render.yaml            Render blueprint: one web service + one database
└── *.html                 the original standalone pages, kept for reference
```

The eight `.html` files at the root are the originals the React app was ported
from. Nothing reads them any more; they are there so the port can be checked
against them.

## Running it

Two terminals:

```bash
# API - no database to install; it keeps data in server/.data/
cd server
npm install && npm start    # http://localhost:10000

# Frontend
cd xspace-portal-react
npm install && npm run dev  # http://localhost:5173
```

Or build the frontend once and let the API serve it from a single port, which
is how it runs on Render:

```bash
cd xspace-portal-react && npm run build
cd ../server && npm start   # http://localhost:10000 serves both
```

## Deploying

`render.yaml` is a Render blueprint. **New → Blueprint**, point it at this
repo, apply. It creates the web service and a free Postgres, wires
`DATABASE_URL` between them and generates a `JWT_SECRET`. Set `SEED_PASSWORD`
yourself in the dashboard first.

Details, the manual path, and the free-tier caveats are in
[`server/README.md`](server/README.md).

## Roles

| # | Role | Login |
|---|---|---|
| 1 | Founder | Founder & Core Team |
| 2 | Core Team | Founder & Core Team |
| 3 | Realtor Partner (a.k.a. Area Partner) | Area / Realtor Partner |
| 4 | Creator Partner | Creator Partner |
| 5 | Xspace Studio | Xspace Studio |

The full module-by-role matrix is in
[`xspace-portal-react/README.md`](xspace-portal-react/README.md).

**Accounts are invite-only** and follow a strict hierarchy:

| Who you are | Accounts you can create |
|---|---|
| Founder | everyone, including Core |
| Core Team | partners only (Realtor, Creator, Studio) |
| Realtor / Creator / Studio | nobody |

A fresh deployment starts with **exactly one account — the Founder**. Whoever
creates an account sets or generates the password and hands it over; the
recipient is forced to change it on first login. See
[`server/README.md`](server/README.md#how-accounts-get-created).

**The access model exists twice on purpose.** `server/src/rbac.js` is
authoritative — it decides what a request may do.
`xspace-portal-react/src/lib/roleConfig.js` only decides what to paint. They
must agree, so `cd server && npm run check:rbac` fails if they drift. Run it
in CI.

## State of the port

Migration onto the API is partial, and the split is worth knowing:

**Real, against the database** - login, sessions, roles, route guards, forced
password change on first login, and the four account screens (Core Team and
the three partner directories) where a Founder or Core member creates an
account and hands over the password.

**Still demo data from `localStorage`** - the dashboard panels, Clients,
Listings, Site Visits and the detail views. The numbers there are seeded
fiction, not rows from the database.

`xspace-portal-react/src/lib/api.js` is the client to migrate the rest onto,
and `server/README.md` has a worked example starting with login.
