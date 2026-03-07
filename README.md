# FRC 9470 Pit Management PWA

Mobile-first Next.js PWA for Team 9470 pit operations.

## Features

- Upcoming match feed with Nexus primary integration and automatic TBA fallback
- Mock match feed mode for pre-event testing without live Nexus/TBA schedule data
- Queue timing, alliance context, and expected match timing
- Guided condensed preflight checklist with subsystem categories, purpose-built numeric controls, and pass/delay workflow
- Delayed action queue with resolve-and-return flow for delegated tasks
- Undo last action in preflight for accidental tap recovery
- Current-event checklist run history
- History summary metrics + run-state filters + one-tap checklist reopen
- Match cards include checklist state (not started / in progress / blocked / ready)
- Offline snapshot support for match feed and offline checklist continuation
- Local browser notifications for queue alerts

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

The app is ready to deploy as a standard Next.js project on Vercel.

### Required Vercel environment variables

- `NEXUS_API_KEY`
- `TBA_API_KEY`

Optional:

- `NEXUS_BASE_URL`
- `TBA_BASE_URL`

Add them in `Project Settings -> Environment Variables`.
These must stay server-side. Do not use `NEXT_PUBLIC_`.

### Recommended Vercel project settings

- Framework Preset: `Next.js`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: leave default

### Deploy flow

1. Import the repo into Vercel
2. Add the environment variables above
3. Deploy
4. Open `/settings` and confirm the pit device event key / mock mode as needed

### Production behavior notes

- `/api/matches` and `/api/integrations/status` are marked dynamic and return `Cache-Control: no-store`
- `sw.js` and `manifest.webmanifest` ship with Vercel headers suitable for PWA updates
- Install icons are included for Android and iOS home screen installs

## Testing before event data exists

1. Open `Settings`
2. Set `Data Mode` to `Mock (generated test schedule)`
3. Save settings
4. Return to dashboard and run full preflight flows from generated matches

## API routes

- `GET /api/matches?team=9470&event=2026xxxx&leadMinutes=20`
- `GET /api/integrations/status`

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
