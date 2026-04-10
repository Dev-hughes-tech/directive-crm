# Hughes Technologies — Infrastructure Map

Last updated: 2026-04-09

## The Box
**Kali Linux** — the private server and data vault. Everything lives here.
- Hosts the application
- Holds the database (IDR + IDV)
- Runs the MCP layer
- Connected to MacBook Air as external HD
- Only external dependencies needed: internet connection + domain

## Current Stack (Transitional)
| Layer | Current | Target (Kali-native) |
|-------|---------|----------------------|
| App host | Vercel | Node.js on Kali |
| Database | Supabase (PostgreSQL) | PostgreSQL on Kali |
| Version control | GitHub + git | git local on Kali |
| Deploy trigger | Vercel CI | Direct restart on Kali |
| Domain | directivecrm.com | directivecrm.com → Kali IP |

## Data Architecture
### IDR — Internal Data Repository
Raw intake layer. 10-slot object capturing data from each source independently:
- `foundation` — county/GIS records
- `satellite` — aerial/satellite imagery analysis
- `photos` — Street View, 360°, Zillow, Redfin
- `noaa` — storm history
- `historicalWeather` — weather archive
- `claude` — Michael AI analysis layer
- `finalProfile` — consolidated output
- `gpt`, `grok`, `gemini` — legacy slots (skipped, kept for backward compat)

### IDV — Internal Data Vault
Clean output layer. 9-key property report built from IDR after research completes:
- `propertyInfo` — core property data
- `photos` — imagery
- `profile` — consolidated property profile
- `claudeData` — Michael AI analysis
- `rawIDR` — full raw intake preserved
- `id`, `address`, `lat`, `lng` — identifiers
- `timestamp`, `researchStatus`, `leadScore` — metadata

### MCP — Model Context Protocol
Tool/connector layer. Wires Michael to external data sources:
- Weather/storm data (NOAA, NWS)
- Property data (county GIS, tax records)
- Imagery (satellite, street view)
- Communication tools (Gmail, Notion)
- Future: fully internal on Kali

## Products
| Product | Status | Description |
|---------|--------|-------------|
| Directive CRM | Live (v896379a) | Roofing CRM — AL + FL launch |
| StormScope | Planned | Weather intelligence API — standalone |
| Michael AI Platform | In development | Standalone AI orchestration — licensing |
| CareNow Healthcare | Planned | Home healthcare coordination — Huntsville |

## Business Structure
```
Hughes Technologies (parent)
├── Michael AI (standalone platform subsidiary)
├── Directive CRM (roofing CRM product)
├── StormScope (weather intelligence product)
└── CareNow (healthcare coordination product)
```
