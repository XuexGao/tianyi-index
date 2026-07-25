# AGENTS.md — TianYi-Index

## Project Overview

Dual-cloud file browser (Tianyi Cloud + OneDrive) built with Next.js 14 (Pages Router), deployed on Vercel. A separate Cloudflare Worker handles WebDAV.

## Commands

```bash
pnpm install          # install deps
pnpm run dev          # start dev server (next dev)
pnpm run build        # production build (next build)
pnpm run lint         # eslint (next lint)
pnpm run format       # prettier on src/**/*.{js,ts,jsx,tsx}
pnpm run extract      # i18next key extraction
```

There is no test suite. Verify changes with `pnpm run build` and `pnpm run lint`.

## Architecture

### Dual-Cloud Drive System

Two cloud drives mounted at configurable paths via env vars:
- **Tianyi Cloud** (`/api/ty/*`): default mount `/`, backed by cloud.189.cn API
- **OneDrive** (`/api/od/*`): default mount `/OneDrive`, backed by Microsoft Graph API

`src/utils/driveResolver.ts` resolves browser URL path → drive type (`ty`/`od`/`virtual`) + API base + relative path. OneDrive is matched first (more specific mount path), Tianyi is the fallback.

### API Routes (`src/pages/api/`)

| Path | Purpose |
|------|---------|
| `ty/` | Tianyi Cloud file listing (with auto-login via env vars) |
| `od/` | OneDrive file listing (OAuth token refresh) |
| `auth/` | Admin login/logout/session check |
| `dav/[[...path]].ts` | WebDAV backend (HMAC-signed by CF Worker) |
| `config.ts` | Site config endpoint |
| `wallpaper.ts` | Random wallpaper proxy |

Legacy `/api/*` paths rewrite to `/api/ty/*` via `next.config.js` rewrites.

### Admin Routes

Admin routes use `@` in URLs but are rewritten:
- `/@login` → `/_admin-login` (page: `src/pages/_admin-login.tsx`)
- `/@manage` → `/_admin-manage` (page: `src/pages/_admin-manage.tsx`)
- `/Admin/*` virtual paths for browsing both drives as admin (see `driveResolver.ts`)

### Middleware (`src/middleware.ts`)

Runs on Edge Runtime. Only does real session verification (via Upstash REST) for `/@manage` and `/@login` routes. Other routes get a lightweight cookie-presence check for UI toggling.

### i18n

8 locales, default `zh-CN`. Uses `next-i18next` with Pages Router SSR translations. Locale files at `public/locales/<locale>/common.json`.

Translation key extraction: `pnpm run extract` (runs `i18next-parser`).

### Config Files

- `config/api.config.js` — OneDrive OAuth endpoints, cache headers
- `config/site.config.js` — Mount paths, protected routes, fonts, site metadata (reads env vars at build time)
- `next-i18next.config.js` — locale list, path to locale files
- `tailwind.config.js` — reads `site.config.js` for font families

### WebDAV Worker (`workers/webdav/`)

Separate Cloudflare Worker. Deploy with:
```bash
npx wrangler deploy --config workers/webdav/wrangler.jsonc
```
Uses HMAC signing (`WEBDAV_WORKER_SECRET`) to communicate with the Vercel backend.

## Key Conventions

- **Package manager**: pnpm (`.npmrc`: `strict-peer-dependencies=false`)
- **Prettier** (config in `package.json`): 120 char width, no semis, single quotes, no parens on single arrow params, tailwind plugin
- **TypeScript**: strict mode but `noImplicitAny: false`
- **Styling**: Tailwind CSS. Custom colors map `gray` → `zinc`, `red` → `rose`, etc. `@tailwindcss/line-clamp` plugin
- **State/data**: SWR for data fetching, no global state library
- **Session storage**: Redis (ioredis) for Tianyi cookies + OneDrive tokens + admin sessions
- **Env vars**: Many use `NEXT_PUBLIC_` prefix for client-side access (mount paths, protected routes, site title). Server-only vars for secrets.

## Gotchas

- `getClientSecret()` in `src/pages/api/od/index.ts` must NOT be called at module top-level — it throws during build when `CRYPTO_SECRET` is absent. Called lazily at runtime only.
- Tianyi session store never saves passwords to Redis — only cookies. Password always read from env var.
- `next.config.js` runs `git rev-parse` at build time for commit hash injection. Missing git is silently caught.
- The catch-all page `src/pages/[...path].tsx` handles all non-API routes — file browsing is client-side path resolution + SWR calls.
- `trailingSlash: true` in `next.config.js` is required for API routes with i18n.
