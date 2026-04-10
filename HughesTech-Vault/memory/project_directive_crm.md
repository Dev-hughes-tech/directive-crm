---
name: Directive CRM Project
description: Core project context for Directive CRM — roofing intelligence platform, single HTML file app (~8400 lines), deployed at directivecrm.com
type: project
---

Directive CRM is a roofing sales CRM being built by Mazerati (Brandon Hughes, mazeratirecords@gmail.com). It competes with AccuLynx, HailTrace, EagleView, and CoreLogic using free public data.

**Architecture (CONFIRMED):**
- Single HTML file app: `Directive_CRM_Desktop_Prototype.html` (~8,400 lines)
- Located at: `/Users/brandonhughes/Documents/Claude/Projects/directive crm/`
- Vercel serverless API functions in `/api/` folder (claude.js, openai.js, grok.js, grok-voice-token.js)
- localStorage as database for contacts, sweep history, proposals, crews, insurance contacts
- Google Maps API for satellite maps (already wired, do NOT replace)
- RainViewer API for live radar overlay (already wired, free)
- NWS API already wired via `loadNWSAlerts()` function

**What's already wired and working:**
- Google Maps satellite view on all 3 maps (territory, sweep, storm)
- NWS live alerts panel — `loadNWSAlerts()` calls api.weather.gov/alerts/active
- RainViewer live radar — `loadRainViewerRadar()` fetches frames
- Claude API via `/api/anthropic` (backend proxy, key secure on Vercel)
- GPT-4o via `/api/openai` (backend proxy)
- Grok via `/api/grok` (backend proxy)
- Full property research pipeline — 3-phase: county GIS + satellite + AI synthesis
- Door log system, appointment scheduling, contacts list — all in localStorage
- `refreshDashboard()` reads from localStorage contacts + sweep history

**What still needs wiring:**
- `LOCAL_INTEL.stormHistory` = empty array `[]` — needs real NOAA SWDI data
- `LOCAL_INTEL.hailZones` = empty array `[]` — needs real NOAA SWDI data
- Dashboard weather widget — no live weather card exists yet; NWS point API needed
- StormScope `displayStormHistory()` and `displayHailZones()` use LOCAL_INTEL (empty)

**AI Engine assignments (Michael AI orchestration):**
- Claude (Anthropic) → reasoning, lead scoring, property research, synthesis, coaching
- GPT-4o (OpenAI) → valuation, commercial classification, data normalization
- Grok (xAI) → real-time market/storm intel, neighborhood data
- Gemini → satellite/image analysis via `/api/satellite-analyze`

**Core features:**
- GPS Sweep Reports (primary feature) — real address discovery via Google Maps geocoding
- Territory Map — satellite, shows sweep zones from localStorage
- StormScope — Google Maps satellite + RainViewer radar + NWS alerts + NOAA hail zones
- Property research — 3-phase AI pipeline (county GIS → satellite → Claude synthesis)
- Smart Estimates — Claude-powered roofing estimates
- Pipeline board, contacts, calendar, reports — all localStorage-based

**Launch states:** Alabama first, then Florida
**Subscription tiers:** Basic / Plus / Pro (tier-gated features already coded)

**Competitive positioning:** Replace AccuLynx ($60-$120/user/mo) + SPOTIO + HailTrace at $45-65/user/mo.
