# Directive CRM MCP Server

A production-grade TypeScript Model Context Protocol (MCP) server that enables AI agents (Claude, etc.) to interact with the Directive CRM platform—a roofing sales intelligence system.

## What It Does

Directive CRM is a platform that helps roofing sales reps research properties, score leads, and assess weather/storm risks. This MCP server gives AI agents access to all core Directive CRM capabilities:

- **Property Research:** Get owner info, roof age, market value, permits, and more for any address
- **Lead Scoring:** Compute lead quality scores (0-99) based on property data
- **Weather Intelligence:** Fetch current conditions, alerts, and forecasts for any location
- **Storm Risk Assessment:** Evaluate hail history and severe weather exposure
- **AI Chat:** Interact with Michael AI—the Directive intelligence assistant for roofing sales
- **Full Reports:** Generate comprehensive property intelligence reports in one call

## Installation

```bash
npm install
npm run build
```

Verify the build succeeded:

```bash
ls dist/
```

You should see `index.js`, `types.js`, `constants.js`, and `services/` directory.

## Configuration

### Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "directive-crm": {
      "command": "node",
      "args": ["/absolute/path/to/directive-crm-mcp-server/dist/index.js"],
      "disabled": false
    }
  }
}
```

Replace `/absolute/path/to/directive-crm-mcp-server` with the actual path to this project.

### Cowork

This MCP server is compatible with Cowork. Configure it as a custom MCP server:

1. In Cowork settings, add a new MCP server
2. Set command: `node`
3. Set args: `["/absolute/path/to/directive-crm-mcp-server/dist/index.js"]`
4. Name: `directive-crm`

## Available Tools (10 Total)

### 1. `directive_research_property`
Research a property address — owner info, roof details, market value, permits. Computes lead score.

**Input:** address (string), response_format (markdown|json)  
**Output:** Property card with owner details, roof age, financial info, and lead score (0-99)

### 2. `directive_geocode_address`
Convert an address to latitude/longitude coordinates.

**Input:** address (string)  
**Output:** Latitude, longitude, formatted address

### 3. `directive_get_weather`
Get current weather conditions for a location.

**Input:** (lat, lng) OR address (string)  
**Output:** Temperature, conditions, wind, humidity, pressure, observation time

### 4. `directive_get_weather_alerts`
Get active severe weather alerts for a location.

**Input:** (lat, lng) OR address (string)  
**Output:** List of active alerts with severity, headline, description, valid time range

### 5. `directive_get_forecast`
Get weather forecast (7 days by default).

**Input:** (lat, lng) OR address (string), optional days (1-14)  
**Output:** Forecast periods with temperature, wind, and conditions

### 6. `directive_get_hail_events`
Get historical NOAA hail events near a location (past 365 days by default).

**Input:** (lat, lng) OR address (string), days, optional radius_miles, response_format  
**Output:** Hail events with date, size (inches), and severity

### 7. `directive_score_lead`
Compute lead score from property characteristics (no API call).

**Input:** roof_age_years, owner_phone, market_value, permit_count  
**Output:** Score (10-99), confidence level, scoring reasons

### 8. `directive_ask_michael`
Chat with Michael AI — the Directive intelligence assistant for roofing sales (powered by Hughes Technologies).

**Input:** message (string), optional context  
**Output:** Michael's response

### 9. `directive_assess_storm_risk`
Assess storm risk using weather alerts and hail history.

**Input:** address OR (lat, lng)  
**Output:** Risk level (High/Moderate/Low), risk score (0-100), contributing factors

### 10. `directive_full_property_report`
Generate complete property intelligence report (research + weather + storm risk).

**Input:** address (string), response_format (markdown|json)  
**Output:** Comprehensive report with property details, location, weather, alerts, forecast, hail history, and storm risk

## Usage Examples

### Research a Property
```
Claude: "Research 924 12th St SW, Fayette, AL"
→ Full property card with owner info, roof age, market value, and lead score
```

### Check Weather Alerts
```
Claude: "What weather alerts are active in Huntsville, AL right now?"
→ List of active severe weather alerts with details
```

### Score a Lead
```
Claude: "Score this lead: 22-year-old roof, owner phone available, $350k market value, no permits"
→ Score: 85/99 (High confidence). Reasons listed.
```

### Ask Michael
```
Claude: "Ask Michael: What roofs in Huntsville are highest risk after last week's storm?"
→ Michael's analysis of storm exposure in that area
```

### Full Report
```
Claude: "Give me a full property report for 200 Main St, Fayette, AL"
→ Complete intel: owner info, weather, alerts, forecast, storm risk, hail history, lead score
```

## Lead Scoring Formula

Computed client-side:

- Base: 50 points
- +35 if roof age ≥ 20 years
- +20 if roof age 15-19 years
- +15 if owner phone is available
- +10 if market value > $200,000
- -10 if property has recent permits
- Clamped to 10-99 range

## API Endpoints Used

All requests go to `https://www.directivecrm.com`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/research` | POST | Property research (owner, roof, permits) |
| `/api/geocode` | GET | Address → coordinates |
| `/api/weather/current` | GET | Current conditions |
| `/api/weather/alerts` | GET | Active weather alerts |
| `/api/weather/forecast` | GET | 7-day forecast |
| `/api/noaa/hail` | GET | Hail event history |
| `/api/michael` | POST | Chat with Michael AI |

## Error Handling

- **Address not found:** "Try including city and state (e.g., '924 12th St SW, Fayette, AL')"
- **Weather data missing:** Returns empty alerts/hail lists (not an error)
- **API timeout:** Error message includes attempt details for debugging
- **Output too large:** Automatically truncates at 25,000 characters with notice

## Response Formats

**Markdown (default):** Human-readable formatted text with sections, bullet points, and tables  
**JSON:** Raw JSON objects for programmatic consumption

## Development

```bash
# Build
npm run build

# Watch mode (rebuilds on changes)
npm run watch

# Start server
npm start
```

## Architecture

```
src/
├── index.ts           # Main server, all 10 tools registered
├── types.ts           # TypeScript interfaces for all API responses
├── constants.ts       # API base URL, scoring weights, thresholds
└── services/
    ├── api.ts         # HTTP client for Directive API calls
    └── scoring.ts     # Lead scoring and storm risk computation
```

## License

MIT

## Support

For issues with the MCP server itself, check the build logs and verify TypeScript compilation. For Directive CRM API issues, verify the base URL is reachable at `https://www.directivecrm.com`.
