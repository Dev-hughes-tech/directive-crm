# Directive CRM — Deployment Version History

Last updated: 2026-04-09

## Current Production Version
**Commit:** `896379a`
**Message:** Add Jobs screen, Insurance Supplement Tracker, Photo Docs, upgraded Materials Calculator
**Live URL:** https://www.directivecrm.com
**Vercel URL:** https://directive-crm.vercel.app

---

## Full Commit Log

| Commit | Description |
|--------|-------------|
| 896379a | Add Jobs screen, Insurance Supplement Tracker, Photo Docs, upgraded Materials Calculator |
| 4be42ee | Fix timeout: 2 searches + parallel NOAA storm data + navigate button |
| 8d36b8d | Fix build: AerialView props, add permit_last_date to Property type |
| cf23172 | Major upgrade: 3D globe default, comprehensive research, expanded property panel |
| c9ce169 | Research: FastPeopleSearch as primary source for owner name + property data |
| 609cf82 | Sharpen research prompts: qPublic first for AL counties, better owner lookup |
| 48bbfa2 | Fix research pipeline: single-hop architecture eliminates after() dependency |
| 30a587e | Fix research pipeline: after() to prevent Vercel kill, 4-search prompt |
| b665381 | Fix MCP research: async polling pattern + 100s timeout |
| bc21321 | Fix map controls, add radar, pin drop sweep, globe view, async research |
| a41051f | Research pipeline: 8 targeted searches (Zillow, Realtor, tax assessor, permits, deeds) |
| 54dee14 | Fix research pipeline: 60s timeout, null-safe data, better error logging |
| 999d611 | Fly-to animation on property research, fix GPS sweep geolocation |
| eb460c8 | Fix GPS sweep: browser geolocation, valid place types, residential reverse-geocode grid |
| f82c8b2 | Night terrain default, night map on dashboard, bigger logo |
| 460f957 | Add residential search, map view modes: hybrid, terrain, night |
| e844243 | Fix MCP server: rewrite to use McpServer SDK v1.x API |

---

## Infrastructure Notes
- **Host (current):** Vercel (temporary scaffolding)
- **Target host:** Kali Linux box — self-hosted, owned infrastructure
- **Database (current):** Supabase PostgreSQL + localStorage fallback
- **Target database:** PostgreSQL on Kali
- **Deploy command (current):** `cd ~/Kali/"Hughes Technologies"/Apps/Claude/DirectiveCrm && npx vercel --prod --yes`
- **Target deploy:** Direct Node.js serve from Kali, no Vercel dependency
