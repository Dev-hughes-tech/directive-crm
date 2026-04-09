import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { directiveAPI } from './services/api.js';
import { scoreLead, assessStormRisk, truncateOutput } from './services/scoring.js';
import { CHARACTER_LIMIT } from './constants.js';
import { PropertyCard, PropertyReport } from './types.js';

const server = new McpServer({
  name: 'directive-crm-mcp-server',
  version: '1.0.0',
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPropertyCardMarkdown(card: PropertyCard): string {
  const reasons = card.leadScore.reasons.map((r) => `- ${r}`).join('\n');
  return `# Property Report

**Address:** ${card.address}

## Owner Information
**Name:** ${card.ownerName || '—'}
**Phone:** ${card.ownerPhone || '—'}
**Email:** ${card.ownerEmail || '—'}

## Property Details
**Year Built:** ${card.yearBuilt || '—'}
**Roof Age:** ${card.roofAgeYears ? `${card.roofAgeYears} years` : '—'}
**County:** ${card.county || '—'}
**Parcel ID:** ${card.parcelId || '—'}

## Financial Information
**Market Value:** ${card.marketValue ? `$${card.marketValue.toLocaleString()}` : '—'}
**Assessed Value:** ${card.assessedValue ? `$${card.assessedValue.toLocaleString()}` : '—'}
**Last Sale Date:** ${card.lastSaleDate || '—'}
**Last Sale Price:** ${card.lastSalePrice ? `$${card.lastSalePrice.toLocaleString()}` : '—'}

## Property Condition
**Permits:** ${card.permitCount !== null ? card.permitCount : '—'}
**Flags:** ${card.flags.length > 0 ? card.flags.join(', ') : 'None'}

## Lead Score
**Score:** ${card.leadScore.score}/99
**Confidence:** ${card.leadScore.confidence}
**Reasons:**
${reasons}
`;
}

function formatPropertyReportMarkdown(report: PropertyReport): string {
  const storm = report.stormRisk;
  let md = formatPropertyCardMarkdown(report.property);

  md += `\n\n## Location\n**Coordinates:** (${report.geocoding.lat}, ${report.geocoding.lng})\n**Full Address:** ${report.geocoding.display_name}\n`;
  md += `\n\n## Current Weather\n`;
  const w = report.weather.current;
  md += `**Temperature:** ${w.temperature_f}°F\n**Conditions:** ${w.conditions}\n**Wind:** ${w.wind_speed_mph} mph from ${w.wind_direction}\n**Humidity:** ${w.humidity_pct}%\n**Pressure:** ${w.pressure_inhg} inHg\n**Observed:** ${w.observed_at}\n`;

  if (report.weather.alerts.length > 0) {
    md += '\n\n## Active Alerts\n';
    report.weather.alerts.forEach((alert) => {
      md += `### ${alert.event} (${alert.severity})\n**Headline:** ${alert.headline}\n**Valid:** ${alert.onset} to ${alert.expires}\n**Description:** ${alert.description}\n\n`;
    });
  } else {
    md += '\n\n## Active Alerts\nNone\n';
  }

  if (report.weather.forecast.length > 0) {
    md += '\n\n## 7-Day Forecast\n';
    report.weather.forecast.filter((p) => p.isDaytime).slice(0, 7).forEach((period) => {
      md += `### ${period.name}\n**Temp:** ${period.temperature}°${period.temperatureUnit}\n**Wind:** ${period.windSpeed} from ${period.windDirection}\n**Forecast:** ${period.shortForecast}\n\n`;
    });
  }

  md += `\n\n## Storm Risk Assessment\n**Risk Level:** ${storm.riskLevel}\n**Risk Score:** ${storm.score}/100\n**Contributing Factors:**\n`;
  storm.factors.forEach((f) => { md += `- ${f}\n`; });

  if (report.hailEvents.length > 0) {
    md += '\n\n## Recent Hail Events\n';
    report.hailEvents.forEach((event) => {
      md += `- ${event.date}: ${event.size}" hail (${event.severity})\n`;
    });
  } else {
    md += '\n\n## Recent Hail Events\nNone\n';
  }

  return md;
}

// ─── Tools ──────────────────────────────────────────────────────────────────

server.tool(
  'directive_research_property',
  'Research a property address to get owner info, roof age, market value, permits, and lead score (0-99).',
  {
    address: z.string().describe('Full property address including city and state'),
    response_format: z.enum(['markdown', 'json']).optional().default('markdown'),
  },
  async ({ address, response_format }) => {
    const result = await directiveAPI.research(address);
    if (result.error || !result.data) throw new Error(`Research failed: ${result.error || 'Unknown error'}`);
    const leadScore = scoreLead({
      roofAgeYears: result.data.roofAgeYears,
      ownerPhone: result.data.ownerPhone,
      marketValue: result.data.marketValue,
      permitCount: result.data.permitCount,
    });
    const card: PropertyCard = {
      address,
      ownerName: result.data.ownerName,
      ownerPhone: result.data.ownerPhone,
      ownerEmail: result.data.ownerEmail,
      yearBuilt: result.data.yearBuilt,
      roofAgeYears: result.data.roofAgeYears,
      marketValue: result.data.marketValue,
      assessedValue: result.data.assessedValue,
      lastSaleDate: result.data.lastSaleDate,
      lastSalePrice: result.data.lastSalePrice,
      permitCount: result.data.permitCount,
      county: result.data.county,
      parcelId: result.data.parcelId,
      flags: result.data.flags,
      leadScore,
    };
    const output = response_format === 'markdown' ? formatPropertyCardMarkdown(card) : JSON.stringify(card, null, 2);
    return { content: [{ type: 'text' as const, text: truncateOutput(output, CHARACTER_LIMIT) }] };
  }
);

server.tool(
  'directive_geocode_address',
  'Convert a street address to latitude/longitude coordinates.',
  { address: z.string().describe('Street address to geocode') },
  async ({ address }) => {
    const result = await directiveAPI.geocode(address);
    const text = `**Location:** ${result.display_name}\n**Latitude:** ${result.lat}\n**Longitude:** ${result.lng}`;
    return { content: [{ type: 'text' as const, text }] };
  }
);

server.tool(
  'directive_get_weather',
  'Get current weather conditions for a location (coordinates or address).',
  {
    lat: z.number().optional(),
    lng: z.number().optional(),
    address: z.string().optional(),
  },
  async ({ lat, lng, address }) => {
    if (!lat || !lng) {
      const geo = await directiveAPI.geocode(address!);
      lat = geo.lat; lng = geo.lng;
    }
    const w = await directiveAPI.getWeatherCurrent(lat, lng);
    const text = `**Conditions:** ${w.conditions}\n**Temperature:** ${w.temperature_f}°F\n**Wind:** ${w.wind_speed_mph} mph from ${w.wind_direction}\n**Humidity:** ${w.humidity_pct}%\n**Pressure:** ${w.pressure_inhg} inHg\n**Station:** ${w.station}\n**Observed:** ${w.observed_at}`;
    return { content: [{ type: 'text' as const, text }] };
  }
);

server.tool(
  'directive_get_weather_alerts',
  'Get active severe weather alerts for a location.',
  {
    lat: z.number().optional(),
    lng: z.number().optional(),
    address: z.string().optional(),
  },
  async ({ lat, lng, address }) => {
    if (!lat || !lng) {
      const geo = await directiveAPI.geocode(address!);
      lat = geo.lat; lng = geo.lng;
    }
    const alerts = await directiveAPI.getWeatherAlerts(lat, lng);
    if (alerts.length === 0) return { content: [{ type: 'text' as const, text: '## Weather Alerts\n\nNo active alerts.' }] };
    let text = '## Active Weather Alerts\n\n';
    alerts.forEach((a) => { text += `### ${a.event} (${a.severity})\n**Headline:** ${a.headline}\n**Valid:** ${a.onset} to ${a.expires}\n**Description:** ${a.description}\n\n`; });
    return { content: [{ type: 'text' as const, text: truncateOutput(text, CHARACTER_LIMIT) }] };
  }
);

server.tool(
  'directive_get_forecast',
  'Get weather forecast (up to 14 days) for a location.',
  {
    lat: z.number().optional(),
    lng: z.number().optional(),
    address: z.string().optional(),
    days: z.number().optional().default(7),
  },
  async ({ lat, lng, address, days }) => {
    if (!lat || !lng) {
      const geo = await directiveAPI.geocode(address!);
      lat = geo.lat; lng = geo.lng;
    }
    const forecast = await directiveAPI.getWeatherForecast(lat, lng);
    const daytime = forecast.filter((p) => p.isDaytime).slice(0, days);
    if (daytime.length === 0) return { content: [{ type: 'text' as const, text: 'No forecast data available.' }] };
    let text = '## Weather Forecast\n\n';
    daytime.forEach((p) => { text += `### ${p.name}\n**Temperature:** ${p.temperature}°${p.temperatureUnit}\n**Wind:** ${p.windSpeed} from ${p.windDirection}\n**Forecast:** ${p.shortForecast}\n\n`; });
    return { content: [{ type: 'text' as const, text: truncateOutput(text, CHARACTER_LIMIT) }] };
  }
);

server.tool(
  'directive_get_hail_events',
  'Get historical NOAA hail events near a location (default: past 365 days).',
  {
    lat: z.number().optional(),
    lng: z.number().optional(),
    address: z.string().optional(),
    days: z.number().optional().default(365),
    radius_miles: z.number().optional().default(25),
    response_format: z.enum(['markdown', 'json']).optional().default('markdown'),
  },
  async ({ lat, lng, address, days, radius_miles, response_format }) => {
    if (!lat || !lng) {
      const geo = await directiveAPI.geocode(address!);
      lat = geo.lat; lng = geo.lng;
    }
    const events = await directiveAPI.getHailEvents(lat, lng, days, radius_miles);
    if (events.length === 0) return { content: [{ type: 'text' as const, text: `No hail events found in past ${days} days.` }] };
    let text = response_format === 'json'
      ? JSON.stringify(events, null, 2)
      : `## Hail Events (Past ${days} Days)\n\n` + events.map((e) => `- **${e.date}:** ${e.size}" hail (${e.severity}) at (${e.lat}, ${e.lng})`).join('\n');
    return { content: [{ type: 'text' as const, text: truncateOutput(text, CHARACTER_LIMIT) }] };
  }
);

server.tool(
  'directive_score_lead',
  'Compute a lead quality score (10-99) from property characteristics. No API call needed.',
  {
    roof_age_years: z.number().optional(),
    owner_phone: z.string().optional(),
    market_value: z.number().optional(),
    permit_count: z.number().optional(),
  },
  async ({ roof_age_years, owner_phone, market_value, permit_count }) => {
    const score = scoreLead({ roofAgeYears: roof_age_years, ownerPhone: owner_phone, marketValue: market_value, permitCount: permit_count });
    const text = `## Lead Score\n\n**Score:** ${score.score}/99\n**Confidence:** ${score.confidence}\n\n**Scoring Factors:**\n${score.reasons.map((r) => `- ${r}`).join('\n')}`;
    return { content: [{ type: 'text' as const, text }] };
  }
);

server.tool(
  'directive_ask_michael',
  'Chat with Michael AI — the Directive CRM intelligence assistant for roofing sales.',
  {
    message: z.string().describe('Your question or request for Michael'),
    context: z.string().optional().describe('Optional context about current property or situation'),
  },
  async ({ message, context }) => {
    const response = await directiveAPI.askMichael(message, context);
    return { content: [{ type: 'text' as const, text: response.reply }] };
  }
);

server.tool(
  'directive_assess_storm_risk',
  'Assess storm risk for a property using active weather alerts and hail history.',
  {
    lat: z.number().optional(),
    lng: z.number().optional(),
    address: z.string().optional(),
  },
  async ({ lat, lng, address }) => {
    if (!lat || !lng) {
      const geo = await directiveAPI.geocode(address!);
      lat = geo.lat; lng = geo.lng;
    }
    const [alerts, hailEvents] = await Promise.all([
      directiveAPI.getWeatherAlerts(lat, lng),
      directiveAPI.getHailEvents(lat, lng, 365),
    ]);
    const risk = assessStormRisk({ alerts, hailEvents });
    let text = `## Storm Risk Assessment\n\n**Risk Level:** ${risk.riskLevel}\n**Risk Score:** ${risk.score}/100\n\n**Contributing Factors:**\n`;
    risk.factors.forEach((f) => { text += `- ${f}\n`; });
    return { content: [{ type: 'text' as const, text }] };
  }
);

server.tool(
  'directive_full_property_report',
  'Generate a complete property intelligence report: owner info, weather, storm risk, hail history, and lead score all in one call.',
  {
    address: z.string().describe('Full property address including city and state'),
    response_format: z.enum(['markdown', 'json']).optional().default('markdown'),
  },
  async ({ address, response_format }) => {
    const [researchResult, geocodeResult] = await Promise.all([
      directiveAPI.research(address),
      directiveAPI.geocode(address),
    ]);
    if (researchResult.error || !researchResult.data) throw new Error(`Research failed: ${researchResult.error || 'Unknown error'}`);

    const [weather, alerts, hailEvents, forecast] = await Promise.all([
      directiveAPI.getWeatherCurrent(geocodeResult.lat, geocodeResult.lng),
      directiveAPI.getWeatherAlerts(geocodeResult.lat, geocodeResult.lng),
      directiveAPI.getHailEvents(geocodeResult.lat, geocodeResult.lng, 365),
      directiveAPI.getWeatherForecast(geocodeResult.lat, geocodeResult.lng),
    ]);

    const leadScore = scoreLead({
      roofAgeYears: researchResult.data.roofAgeYears,
      ownerPhone: researchResult.data.ownerPhone,
      marketValue: researchResult.data.marketValue,
      permitCount: researchResult.data.permitCount,
    });

    const report: PropertyReport = {
      address,
      geocoding: { lat: geocodeResult.lat, lng: geocodeResult.lng, display_name: geocodeResult.display_name },
      property: {
        address,
        ownerName: researchResult.data.ownerName,
        ownerPhone: researchResult.data.ownerPhone,
        ownerEmail: researchResult.data.ownerEmail,
        yearBuilt: researchResult.data.yearBuilt,
        roofAgeYears: researchResult.data.roofAgeYears,
        marketValue: researchResult.data.marketValue,
        assessedValue: researchResult.data.assessedValue,
        lastSaleDate: researchResult.data.lastSaleDate,
        lastSalePrice: researchResult.data.lastSalePrice,
        permitCount: researchResult.data.permitCount,
        county: researchResult.data.county,
        parcelId: researchResult.data.parcelId,
        flags: researchResult.data.flags,
        leadScore,
      },
      weather: { current: weather, alerts, forecast },
      stormRisk: assessStormRisk({ alerts, hailEvents }),
      hailEvents,
    };

    const output = response_format === 'markdown' ? formatPropertyReportMarkdown(report) : JSON.stringify(report, null, 2);
    return { content: [{ type: 'text' as const, text: truncateOutput(output, CHARACTER_LIMIT) }] };
  }
);

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
