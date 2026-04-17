# Directive CRM

Directive CRM is a Next.js 16 roofing-sales CRM focused on property research, storm intelligence, proposals, jobs, team communication, and Michael AI workflows.

## Stack

- Next.js App Router with React 19 and TypeScript
- Supabase for auth, Postgres, and object storage
- Anthropic for research and Michael AI responses
- NOAA, Google Maps, and other external data providers for weather, geocoding, and storm workflows

## Local Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Required Environment

Core:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

AI and research:
- `ANTHROPIC_API_KEY`

Maps and weather:
- `NEXT_PUBLIC_MAPS_API_KEY` or `MAPS_API_KEY`

Messaging and email:
- `EMAIL_ACCOUNT_ENCRYPTION_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_DOMAIN`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`

Optional hardening flags:
- `EMAIL_ALLOW_PLAINTEXT_FALLBACK=false`
- `TWILIO_ALLOW_UNSIGNED_WEBHOOKS=false`
- `OBSERVABILITY_WEBHOOK_URL`

## Key Workflows

- Property research starts at `/api/research/start` and is normalized so roof age is only permit-backed.
- StormScope uses `/api/noaa/hail` and `/api/noaa/hwel` with one shared severe-hail threshold.
- Michael AI uses `/api/michael` and `/api/michael/leads`; server-verified CRM counts are separated from client-reported session context.
- Job and property photo uploads use private Supabase storage plus signed delivery.

## Truth Model

- Roof age is verified only when derived from an actual roofing permit date.
- Permit counts may be unknown; absence of evidence should not be rendered as zero.
- Michael operational counts are server-verified where possible and explicitly labeled unverified when they come from browser session state.
- Private photos are stored in private buckets and returned through signed URLs.

## Verification

Useful local checks:

```bash
npx tsc --noEmit
node --experimental-strip-types --test tests/*.mts
```

Health probe:

```bash
curl http://localhost:3000/api/health
```

## Repo Notes

- Supabase migrations in `supabase/migrations` are part of the audited source of truth and now include the canonical `profiles` schema plus live RLS backfills.
- The UI shell is intentionally design-heavy; backend, state, and data-truth changes should avoid altering layout or styling without a strong reason.
