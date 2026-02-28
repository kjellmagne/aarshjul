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

## Docker

Build image locally:

```bash
docker build -t aarshjul:local .
```

Run image locally:

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/aarshjul" \
  -e NEXTAUTH_URL="http://localhost:3000" \
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
3. Configure Azure AD values:
   - `AZURE_AD_CLIENT_ID`
   - `AZURE_AD_CLIENT_SECRET`
   - `AZURE_AD_TENANT_ID`
   - Add `http://localhost:3000/api/auth/callback/azure-ad` as redirect URI in Azure AD app registration.
4. Generate Prisma client and apply schema:

```bash
npm run db:generate -w apps/web
npm run db:push -w apps/web
```

## API endpoints (new backend slice)

- `GET/POST /api/wheels`
- `GET/PATCH /api/wheels/:wheelId`
- `GET/POST /api/wheels/:wheelId/activities`
- `PATCH/DELETE /api/activities/:activityId`
- `GET/POST/DELETE /api/wheels/:wheelId/share` (share with user email or Azure AD group id)
- `GET/PATCH /api/activities/:activityId/schedule` (advanced scheduling + reminder policy)
- `POST /api/jobs/reminders/dispatch` (cron/webhook-driven reminder dispatcher, requires `x-job-secret`)

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
