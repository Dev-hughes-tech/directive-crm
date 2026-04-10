---
name: Master Build Spec Reference
description: Directive CRM 10-step build spec — completed Steps 1-5, partially Step 6. Build chat set up GitHub, Next.js 16, Vercel, Supabase, env vars. API routes partially built.
type: reference
---

Build chat completed Steps 1-5 of master build spec:
- Step 1: GitHub repo Dev-hughes-tech/directive-crm (private)
- Step 2: Next.js 16.2.2 + TypeScript + Tailwind 4 + shadcn/ui (base-nova)
- Step 3: Vercel connected, GitHub auto-deploy on push to main, directivecrm.com aliased
- Step 4: Supabase project (smvnidiybgdkbhzbldph), tables: properties (30 cols), searches
- Step 5: Env vars set in Vercel (ANTHROPIC_API_KEY, MAPS_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, REPORT_EMAIL=support@hughes-technologies.com)
- Step 6: /api/research route exists (Claude web search for property data)

**How to apply:** When building, use MAPS_API_KEY (not GOOGLE_MAPS_API_KEY). Keep existing /api/research route. Supabase URL: https://smvnidiybgdkbhzbldph.supabase.co. Deploy by pushing to GitHub main branch — Vercel auto-deploys.

Vercel env var names: MAPS_API_KEY, ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, REPORT_EMAIL
