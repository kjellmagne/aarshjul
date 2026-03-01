# Aarshjul Prototype

Initial milestone for a circular annual planner based on your product scope:

- `packages/wheel-core`: shared geometry/time engine
- `apps/web`: Next.js demo rendering a static SVG wheel using `wheel-core`
- `apps/web/prisma`: persistence model for wheels, sharing, activities, advanced scheduling and reminders

## Run

```bash
npm install --cache .npm-cache
npm run db:generate -w apps/web
npm run test
npm run build
npm run dev
```

Notes:
- `npm run dev -w apps/web` now uses Webpack mode for a more stable local dev experience.
- `npm run dev:turbo -w apps/web` starts Turbopack mode.
- `npm run dev:clean -w apps/web` clears `.next` cache and starts dev, but only if port `3001` is free (prevents corrupting a running dev server).

## Docker

Build image locally:

```bash
docker build -t aarshjul:local .
```

Run image locally:

```bash
docker run --rm -p 3001:3000 \
  -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/aarshjul" \
  -e NEXTAUTH_URL="http://localhost:3001" \
  -e NEXTAUTH_SECRET="replace-with-long-random-secret" \
  -e AZURE_AD_CLIENT_ID="..." \
  -e AZURE_AD_CLIENT_SECRET="..." \
  -e AZURE_AD_TENANT_ID="..." \
  aarshjul:local
```

The app image is defined in:
- `Dockerfile` (multi-stage, production image)
- `.dockerignore`

## GitHub Container Workflow

GitHub Actions workflow builds the Docker image on push/PR and publishes to GHCR on non-PR events:

- Workflow file: `.github/workflows/docker-image.yml`
- Target image: `ghcr.io/kjellmagne/aarshjul`
- Published tags include branch/tag/sha and `latest` on default branch.

## Database + auth setup

1. Copy `apps/web/.env.example` to `apps/web/.env.local`.
2. Configure `DATABASE_URL` for PostgreSQL.
3. Configure login:
   - Local login works with e-mail/password out of the box.
   - Dedicated system admin local login is always available via username/password.
   - Dedicated system admin login page: `/sysadmin-login` (linked from main login page).
   - Default system admin credentials: `sysadmin` / `sysadmin` (change in `.env.local` using `SYSTEM_ADMIN_LOCAL_*`).
   - Configure tenant admin bootstrap e-mail(s) with `ADMIN_EMAILS` (comma-separated) in `apps/web/.env.local`.
   - Configure system admin bootstrap e-mail(s) with `SYSTEM_ADMIN_EMAILS` (comma-separated).
   - Optional: map Azure AD group id(s) to system admin role with `SYSTEM_ADMIN_GROUP_IDS` (comma-separated).
   - Azure AD is optional; set these values only if you want Azure AD SSO:
   - `AZURE_AD_CLIENT_ID`
   - `AZURE_AD_CLIENT_SECRET`
   - `AZURE_AD_TENANT_ID`
   - Add `http://localhost:3001/api/auth/callback/azure-ad` as redirect URI in Azure AD app registration.
4. Generate Prisma client and apply schema:

```bash
npm run db:generate -w apps/web
npm run db:push -w apps/web
```

## Tenant admin page

- Dedicated tenant admin page: `/admin`
- Requires an admin account (`isAdmin=true`)
- First admin is bootstrapped by `ADMIN_EMAILS` in `apps/web/.env.local`
- Supports:
  - tenant setup/config (`tenantName`, support e-mail, timezone, default language, enabled sign-in providers)
  - admin overview metrics
  - account role management (grant/revoke admin)

## System admin page

- Dedicated platform/system admin page: `/sysadmin`
- Requires a system admin account (`isSystemAdmin=true`)
- First system admin is bootstrapped by `SYSTEM_ADMIN_EMAILS` (or first successful claim)
- Supports:
  - tenant administration (create/delete tenants)
  - tenant admin assignment per tenant
  - platform overview metrics
  - role management for both system admin and tenant admin
  - dedicated claim flow for first-time platform bootstrap

## API endpoints (new backend slice)

- `GET/POST /api/wheels`
- `GET/PATCH /api/wheels/:wheelId`
- `GET/POST /api/wheels/:wheelId/activities`
- `PATCH/DELETE /api/activities/:activityId`
- `GET/POST/DELETE /api/wheels/:wheelId/share` (share with user email or Azure AD group id)
- `GET/PATCH /api/activities/:activityId/schedule` (advanced scheduling + reminder policy)
- `POST /api/jobs/reminders/dispatch` (cron/webhook-driven reminder dispatcher, requires `x-job-secret`)
- `GET/PATCH /api/admin/tenant` (tenant setup/config, admin only)
- `GET /api/admin/overview` and `GET/PATCH /api/admin/users` (admin only)
- `POST /api/admin/claim` (first-time admin bootstrap or `ADMIN_EMAILS` claim)
- `GET /api/sysadmin/overview`, `GET /api/sysadmin/users`, `PATCH /api/sysadmin/users/:userId` (system admin only)
- `GET/POST /api/sysadmin/tenants`, `PATCH/DELETE /api/sysadmin/tenants/:tenantId` (system admin only)
- `GET/POST /api/sysadmin/tenants/:tenantId/admins`, `DELETE /api/sysadmin/tenants/:tenantId/admins/:userId` (system admin only)
- `POST /api/sysadmin/claim` (first-time system admin bootstrap or `SYSTEM_ADMIN_EMAILS` claim)
- `GET /api/tenant` (public tenant sign-in policy + display metadata)

## Current wheel-core modules

- `timeScale.ts`: time <-> angle mapping, timezone support, snapping (day/week/month)
- `ringLayout.ts`: ring radius layout from `heightPct`
- `laneAssignment.ts`: overlap lane allocation for activities
- `textPlacement.ts`: text visibility + ellipsis heuristics for arc labels
- `hitTest.ts`: cartesian/polar conversion and ring/segment hit-testing

## Next implementation slice

- Introduce domain types (`Disc`, `DiscRing`, `Activity`, `Tag`) in a shared package
- Add persisted API CRUD (NestJS/FastAPI + Postgres)
- Replace static demo data with API data and add editing flow
