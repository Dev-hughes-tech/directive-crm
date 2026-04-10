---
name: API Keys and Authorizations — Directive CRM
description: All API keys, env vars, and external service access needed to build Directive CRM. Check this before asking the user for credentials.
type: reference
---

## Status Key
✅ = Confirmed working | ⚠️ = Partial (local only, not in Vercel) | ❓ = Unknown / not yet confirmed | ❌ = Not set up

## Confirmed API Keys

| Variable | Value | Notes |
|---|---|---|
| MAPS_API_KEY | AIzaSyBpdiGizwqZtytGA1A8iSyTWJl6oKkBuNk | Google Maps — server-side |
| NEXT_PUBLIC_MAPS_API_KEY | AIzaSyBpdiGizwqZtytGA1A8iSyTWJl6oKkBuNk | Same key, browser-side (NEXT_PUBLIC_ prefix required by Next.js for client components) |
| NEXT_PUBLIC_SUPABASE_URL | https://smvnidiybgdkbhzbldph.supabase.co | Supabase project URL ✅ |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtdm5pZGl5Ymdka2JoemJsZHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTkxNDksImV4cCI6MjA5MDk5NTE0OX0.sURjjZRbJIXiLGMIzvno0d0fLYOO6DtaLS7WT2PVtJs | Supabase anon key ✅ |
| GEMINI_API_KEY | AIzaSyB-eA-5thxekWsmjFYlc_Qr4kTiQtjtZtE | Gemini |
| OPENAI_API_KEY | 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 | OpenAI ✅ |
| XAI_API_KEY | xai-RhCgcvkZWYjld... (full key in .env.local) | Grok/xAI |
| XAI_VOICE_KEY | xai-eU8yVttHxci3... (full key in .env.local) | xAI voice |

## NEXT_PUBLIC_ Explanation (for reference)
In Next.js, env vars are server-side only by default. Any variable used in browser/React components MUST have NEXT_PUBLIC_ prefix or it will be undefined in the browser. This has nothing to do with which service you use — it's a Next.js security mechanism. MAPS_API_KEY and NEXT_PUBLIC_MAPS_API_KEY are the same Google Maps key, used in different contexts.

## Google Maps API
- Key: AIzaSyBpdiGizwqZtytGA1A8iSyTWJl6oKkBuNk
- Required APIs to enable in Google Cloud Console: Street View Static API, Maps Static API, Geocoding API
- Status: ❓ — user needs to confirm these 3 are enabled in console.cloud.google.com

## Supabase (database)
- Project URL: https://smvnidiybgdkbhzbldph.supabase.co
- Anon Key: confirmed above
- Status: ✅ — credentials confirmed, integration in progress
- Tables needed: properties, clients, proposals, proposal_line_items, materials, chat_messages

## Supabase Service Role Key (server-side only — NEVER use NEXT_PUBLIC_ prefix)
- SUPABASE_SERVICE_ROLE_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtdm5pZGl5Ymdka2JoemJsZHBoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQxOTE0OSwiZXhwIjoyMDkwOTk1MTQ5fQ.hdOBUG495hZCA5bpgE9KrLR4v2_6BDW-LpUw0UFx4AU
- Use this in API routes for admin operations that bypass RLS
- NEVER expose in client-side code

## Contact Info
- REPORT_EMAIL: support@hughes-technologies.com

## Twilio (SMS/texting)
- Status: ❓ — not yet set up
- Need: Account SID, Auth Token, Twilio phone number

## Anthropic API
- ANTHROPIC_API_KEY: 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
- Used in: /app/api/research/route.ts and /app/api/michael/route.ts
- Status: ✅ confirmed

## Vercel MCP
- Connected via MCP connector (mcp__8cbd30e0-b274-4f48-a631-88a9c7216834)
- Project ID: prj_9pi4Ux6kbaXu5WbOGUv89kRAidLe
- Team ID: team_zZAOxlRJSlUJtqghDjvpuTAK
- deploy_to_vercel MCP tool exists but only gives instructions, does not actually deploy
- User must run: npx vercel --prod --yes from their Mac terminal

## MCP Connectors Already Working
- ✅ Vercel MCP (project info, deployment status, logs)
- ✅ Gmail MCP
- ✅ Google Drive MCP
- ✅ Notion MCP
- ✅ Figma MCP
- ✅ Canva MCP

## Sandbox Network Limitation
The Linux sandbox CANNOT make outbound requests via Bash commands.
All external service interaction goes through MCP connectors.
For deployments: user runs npx vercel --prod --yes from their Mac terminal.
Never ask user to create accounts or set up services — only ask for credentials if a service already exists.

## Pending User Actions
1. Add these to Vercel dashboard (Settings → Environment Variables):
   - NEXT_PUBLIC_MAPS_API_KEY = AIzaSyBpdiGizwqZtytGA1A8iSyTWJl6oKkBuNk
   - NEXT_PUBLIC_SUPABASE_URL = https://smvnidiybgdkbhzbldph.supabase.co
   - NEXT_PUBLIC_SUPABASE_ANON_KEY = (full key above)
2. Confirm 3 Google APIs enabled in Cloud Console
3. Set up Twilio when ready for real SMS
