# Xspace & Co. Portal — React

React (Vite) port of the eight standalone HTML pages in the parent folder. The
originals are untouched; this is a separate project beside them.

## Running

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview
```

> **`.npmrc` is load-bearing.** This project lives under a folder whose name
> contains `&` (`XSPACE & CO Portal`). npm puts `node_modules/.bin` on `PATH`
> before running a script, and cmd.exe reads the `&` as a command separator, so
> scripts die with `'CO' is not recognized...`. `.npmrc` sets
> `script-shell=powershell`, which parses the path correctly. Moving the
> project to a path without `&` would also fix it; deleting `.npmrc` without
> doing that will break `npm run dev`.

## Roles & access

Five roles across four logins. Founder and Core share a login; the other three
each have their own. The spec calls role #3 "Area Partner" in places and
"Realtor Partner" in others — same role, keyed `realtor`. It replaces the old
`agent` role, and saved `agent` sessions are mapped onto it automatically.

| # | Role | Login | Sees |
|---|---|---|---|
| 1 | Founder | Founder & Core Team | Everything, plus Finances, Core Team and the Audit Log |
| 2 | Core Team | Founder & Core Team | Everything except Finances and Core Team admin |
| 3 | Realtor Partner | Area / Realtor Partner | Only their own listings, visits, leads and commission |
| 4 | Creator Partner | Creator Partner | Only their own uploaded leads, media and commission |
| 5 | Xspace Studio | Xspace Studio | Projects and the media pipeline; no leads, no commissions |

### Module matrix

| Module | Route | Founder | Core | Realtor | Creator | Studio |
|---|---|:-:|:-:|:-:|:-:|:-:|
| Dashboard | `/dashboard` | ● | ● | own | own | own |
| Creator Partners | `/partners/creators` | ● | ● | | | |
| Realtor Partners | `/partners/realtors` | ● | ● | | | |
| Studio Partners | `/partners/studio` | ● | ● | | | |
| Partner Dashboards | `/partner-dashboards` | ● | ● | | | |
| CRM | `/clients` | ● | ● | | | |
| Lead Tracker | `/clients` | | | own | own | |
| Lead Uploads | `/lead-uploads` | | | | ● | |
| Listings | `/listings` | ● | ● | own | | |
| Projects | `/projects` | ● | ● | | upcoming | ● |
| Site Visits | `/site-visits` | ● | ● | own | | |
| Live Verifications | `/verifications` | ● | ● | | | |
| Commission Tracker | `/commissions` | ● | ● | own | own | |
| Finances | `/finances` | ● | | | | |
| Media Upload | `/media-upload` | | | ● | ● | ● |
| Raw Media Inbox | `/raw-media` | ● | ● | | | ● |
| Media Library | `/media-library` | ● | ● | | | ● |
| Pending Works | `/pending-works` | | | | | ● |
| Quick Tools | `/quick-tools` | | | | | ● |
| Area Updates | `/area-updates` | | | ● | | |
| Issues & Queries | `/issues` | ● | ● | own | own | own |
| Communication | `/communication` | ● | ● | ● | | ● |
| Rules & Regulations | `/rules` | | | ● | ● | ● |
| Core Team | `/teams` | ● | | | | |
| Profile & KYC | `/profile-kyc` | | | ● | ● | ● |
| Settings | `/settings` | ● | ● | ● | ● | ● |

`own` means the role sees only its own records; `upcoming` means creators see
new and upcoming listings only.

The whole matrix lives in one place — the `MODULES` array in
[`src/lib/roleConfig.js`](src/lib/roleConfig.js). Nothing else in the app
hard-codes a role name, so changing access is a one-line edit there. It drives
the sidebar, the route guard, the dashboard panels and the quick actions.

**This is front-end gating only.** It decides what to paint, not what a user is
entitled to. Every one of these checks has to be repeated server-side before
this handles real data.

### Enforcement

Two layers, both derived from the same registry:

- `RequireAuth` — no `xspace_auth` flag means a redirect to `/login`. `?dev=1`
  bypasses it and reveals the role switcher in the top bar.
- `RequireModule` — the route must map to a module the current role holds, or
  you get "Access denied". Built pages and placeholder pages go through the
  same gate, so typing `/finances` as a Realtor Partner is refused exactly like
  typing `/partner-dashboards`.

### Pages built vs. specified

Built and working: Dashboard (five role-specific variants), CRM / Lead Tracker,
Listings, Site Visits, Core Team, plus the lead and listing detail views.

The remaining modules have their access control live and their route wired, but
render `ModulePage` — a placeholder listing who can reach the module and what
the spec says belongs in it. That makes the permission model testable now and
leaves the feature work scoped. `BUILT` in [`src/App.jsx`](src/App.jsx) is
where a real screen gets swapped in.

## Page provenance

| Route | Ported from |
|---|---|
| `/login` | `index.html` |
| `/dashboard` | `dashboard.html` |
| `/clients` | `client.html` |
| `/clients/:id` | `leadview.html` |
| `/listings` | `listings.html` |
| `/listings/:id` | `listingsview.html` |
| `/site-visits` | `sitevisits.html` |
| `/teams` | `teams.html` |

## How the CSS was kept identical

Each page was authored as its own document with its own `:root` palette, and
several of them disagree (the login page is light-first at `--bg:#fff`, the
rest are dark at `--bg:#0b0b0b`). Sharing one document would have let them
overwrite each other, so every page's stylesheet is scoped under its own root
class instead:

- `:root { … }` became `.page-clients { … }` — custom properties still cascade
  to descendants, so nothing else had to change.
- `[data-theme="light"] { … }` became `[data-theme="light"] .page-dashboard { … }`;
  the attribute still lives on `<html>`, so both theme toggles work as before.
- `body { … }` rules moved onto the same page root, except the two that are
  genuinely document-level (page background, and the dashboard's
  `overflow:hidden`). Those live in `styles/global.css`, keyed off
  `body[data-page="…"]`, which `usePageClass()` sets per route.
- Inline `style="…"` attributes that were pure layout became named classes with
  the same values; nothing was restyled.

## Layout

```
src/
  main.jsx              seeds the demo data, mounts the router
  App.jsx               one route per module, all behind the two guards
  styles/global.css     document-level rules only
  lib/
    storage.js          localStorage keys + JSON helpers
    seed.js             one-time demo dataset (same keys as the original)
    roleConfig.js       THE access model: roles, module registry, matrix
    metrics.js          every render*() computation, as pure functions
    time.js             timeAgo()
  hooks/
    usePageClass.js     sets body[data-page]
    useTheme.js         xspace_theme <-> <html data-theme>
  routes/
    RequireAuth.jsx     signed in?
    RequireModule.jsx   does this role hold this module?
  pages/
    Login / Clients / LeadView / Listings / ListingView / SiteVisits / Teams
    ModulePage.jsx      placeholder for specified-but-unbuilt modules
    dashboard/
      Dashboard.jsx        role-composed panel layout
      PortalLayout.jsx     sidebar + topbar + modals, shared by in-portal pages
      DashboardStore.jsx   context replacing the global renderAll()
      components/
        Sidebar.jsx        rendered from modulesForRole()
        Topbar.jsx         search, role switcher, notifications, profile
        LeftPanels.jsx     approvals, quick actions, activity, verifications…
        RightPanels.jsx    lead funnel, studio, team, projects, audit
        RealtorPanel.jsx   realtor partner KPIs
        PartnerPanels.jsx  creator, studio, commission, my-issues panels
        Modals.jsx         notifications, ticket, contact core, profile
```

The seven pages ported verbatim from the original HTML deliberately sit
*outside* `PortalLayout` — they were authored as standalone documents and keep
that look, which is why they have no sidebar. Wrapping one in `<PortalLayout>`
gives it the nav chrome if you'd rather they matched.

The dashboard's `renderAll()` pattern is replaced by `DashboardStore`, a
context holding every dataset in React state and mirroring writes back to
`localStorage` under the original keys — so an existing browser profile keeps
its data, and a refresh still restores it.

## Deliberate differences from the originals

Behaviour is otherwise a straight port. These are the changes, each made
because the original was unfinished or broken:

1. **Inter actually loads now.** Every page's CSS asked for `Inter` first, but
   only `teams.html` linked the webfont, so the other seven silently fell back
   to `system-ui`. `index.html` now loads it, which slightly changes text
   metrics everywhere. Remove the Google Fonts `<link>` to go back.
2. **Tailwind CDN dropped from Teams.** In a SPA its Preflight reset would
   restyle every other page. The utilities that page used are reproduced in
   `teams.css` at their exact Tailwind default values.
3. **Quick Actions is visible.** The original set its `showFor` to
   `cfg.modules` and then tested `showFor.includes(role)` — comparing module
   names against a role name, which is never true, so the panel was hidden for
   everyone. It now shows the actions the role is allowed.
4. **Sidebar navigates.** Modules with a real page (Listings, Clients, Site
   Visits, Team) route there instead of firing the `alert('… (demo)')`
   placeholder. Modules without a page still show the placeholder.
5. **Cross-page links fixed.** `client.html` linked to `lead-view.html` and
   `leadview.html` to `site-visits.html`; neither file existed (the real names
   had no hyphen). They now point at `/clients/:id` and `/site-visits`.
6. **Site Visits: three dead controls wired up.** The Agent and Mode filters
   and the "Today's Visits" strip were in the markup and CSS but nothing ever
   populated or applied them.
7. **Login role mapping.** A founder/admin/core email set the role to `admin`,
   which isn't a role the app defines; it only worked because the seed's
   fallback quietly rewrote it to `founder`. It now returns `founder` directly.
8. **Teams jumps to the new member's tab** after adding, instead of staying put
   and appearing to have done nothing.
9. **Dropped:** `renderFinancial()` — it wrote to element IDs (`finSales`,
   `commissionList`) that no page ever contained. The `xspace_commissions` seed
   data is still there if you want to build that panel.

## Demo credentials

Any email with a 4+ character password. The role comes from the address:

| Email contains | Role |
|---|---|
| `founder`, `admin`, `owner` | Founder |
| `core`, `ops` | Core Team |
| `creator`, `content` | Creator Partner |
| `studio`, `edit`, `media` | Xspace Studio |
| anything else | Realtor Partner |

Seeded users: `tej@xspace.co` (Founder), `karthik@xspace.co` (Core),
`sai@xspace.co` (Realtor), `priya@xspace.co` (Creator), `studio@xspace.co`
(Studio).

Add `?dev=1` to any route to skip the auth guard and get the role switcher in
the top bar — the fastest way to see the matrix above in action.

## Checks

```bash
npm run lint     # eslint, catches undefined vars the Vite build will happily ship
npm run build
```
