import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { directiveAPI } from './services/api.js';
import { scoreLead, assessStormRisk, truncateOutput } from './services/scoring.js';
import { CHARACTER_LIMIT } from './constants.js';
import { PropertyCard, PropertyReport } from './types.js';

// Tool Input Schemas (Zod for validation)
const AddressInputSchema = z.object({
  address: z.string(),
  response_format: z.string().optional().default('markdown'),
});

const CoordinatesOrAddressInputSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  address: z.string().optional(),
});

const ForecastInputSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  address: z.string().optional(),
  days: z.number().optional(),
});

const HailInputSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  address: z.string().optional(),
  days: z.number().optional(),
  radius_miles: z.number().optional(),
  response_format: z.string().optional().default('markdown'),
});

const LeadScoreInputSchema = z.object({
  roof_age_years: z.number().optional(),
  owner_phone: z.string().optional(),
  market_value: z.number().optional(),
  permit_count: z.number().optional(),
});

const MichaelInputSchema = z.object({
  message: z.string(),
  context: z.string().optional(),
});

const SimpleAddressSchema = z.object({ address: z.string() });

// Initialize server
const server = new Server({
  name: 'directive-crm-mcp-server',
  version: '1.0.0',
});

// Helper: format property card as markdown
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

// Helper: format property report as markdown
function formatPropertyReportMarkdown(report: PropertyReport): string {
  const storm = report.stormRisk;
  let markdown = formatPropertyCardMarkdown(report.property);

  markdown += '\n\n## Location\n';
  markdown += `**Coordinates:** (${report.geocoding.lat}, ${report.geocoding.lng})\n`;
  markdown += `**Full Address:** ${report.geocoding.display_name}\n`;

  markdown += '\n\n## Current Weather\n';
  const weather = report.weather.current;
  markdown += `**Temperature:** ${weather.temperature_f}°F\n`;
  markdown += `**Conditions:** ${weather.conditions}\n`;
  markdown += `**Wind:** ${weather.wind_speed_mph} mph from ${weather.wind_direction}\n`;
  markdown += `**Humidity:** ${weather.humidity_pct}%\n`;
  markdown += `**Pressure:** ${weather.pressure_inhg} inHg\n`;
  markdown += `**Observed:** ${weather.observed_at}\n`;

  if (report.weather.alerts.length > 0) {
    markdown += '\n\n## Active Alerts\n';
    report.weather.alerts.forEach((alert) => {
      markdown += `### ${alert.event} (${alert.severity})\n`;
      markdown += `**Headline:** ${alert.headline}\n`;
      markdown += `**Valid:** ${alert.onset} to ${alert.expires}\n`;
      markdown += `**Description:** ${alert.description}\n\n`;
    });
  } else {
    markdown += '\n\n## Active Alerts\nNone\n';
  }

  if (report.weather.forecast.length > 0) {
    markdown += '\n\n## 7-Day Forecast (Daytime)\n';
    report.weather.forecast
      .filter((p) => p.isDaytime)
      .slice(0, 7)
      .forEach((period) => {
        markdown += `### ${period.name}\n`;
        markdown += `**Temp:** ${period.temperature}°${period.temperatureUnit}\n`;
        markdown += `**Wind:** ${period.windSpeed} from ${period.windDirection}\n`;
        markdown += `**Forecast:** ${period.shortForecast}\n\n`;
      });
  }

  markdown += '\n\n## Storm Risk Assessment\n';
  markdown += `**Risk Level:** ${storm.riskLevel}\n`;
  markdown += `**Risk Score:** ${storm.score}/100\n`;
  markdown += '**Contributing Factors:**\n';
  storm.factors.forEach((factor) => {
    markdown += `- ${factor}\n`;
  });

  if (report.hailEvents.length > 0) {
    markdown += '\n\n## Recent Hail Events\n';
    report.hailEvents.forEach((event) => {
      markdown += `- ${event.date}: ${event.size}" hail (${event.severity})\n`;
    });
  } else {
    markdown += '\n\n## Recent Hail Events\nNone\n';
  }

  return markdown;
}

// Define all tools with minimal schemas
const tools = [
  {
    name: 'directive_research_property',
    description:
      'Research a property address to get owner information, roof details, market value, and permits. Computes lead score based on property data.',
    inputSchema: { type: 'object' as const, properties: { address: { type: 'string' }, response_format: { type: 'string', enum: ['markdown', 'json'] } }, required: ['address'] },
  },
  {
    name: 'directive_geocode_address',
    description: 'Convert an address string to latitude/longitude coordinates.',
    inputSchema: { type: 'object' as const, properties: { address: { type: 'string' } }, required: ['address'] },
  },
  {
    name: 'directive_get_weather',
    description: 'Get current weather conditions for a location.',
    inputSchema: { type: 'object' as const, properties: { lat: { type: 'number' }, lng: { type: 'number' }, address: { type: 'string' } } },
  },
  {
    name: 'directive_get_weather_alerts',
    description: 'Get active severe weather alerts for a location.',
    inputSchema: { type: 'object' as const, properties: { lat: { type: 'number' }, lng: { type: 'number' }, address: { type: 'string' } } },
  },
  {
    name: 'directive_get_forecast',
    description: 'Get weather forecast for a location.',
    inputSchema: { type: 'object' as const, properties: { lat: { type: 'number' }, lng: { type: 'number' }, address: { type: 'string' }, days: { type: 'number' } } },
  },
  {
    name: 'directive_get_hail_events',
    description: 'Get historical NOAA hail events near a location.',
    inputSchema: { type: 'object' as const, properties: { lat: { type: 'number' }, lng: { type: 'number' }, address: { type: 'string' }, days: { type: 'number' }, radius_miles: { type: 'number' }, response_format: { type: 'string', enum: ['markdown', 'json'] } } },
  },
  {
    name: 'directive_score_lead',
    description: 'Compute lead score based on property characteristics.',
    inputSchema: { type: 'object' as const, properties: { roof_age_years: { type: 'number' }, owner_phone: { type: 'string' }, market_value: { type: 'number' }, permit_count: { type: 'number' } } },
  },
  {
    name: 'directive_ask_michael',
    description: 'Chat with Michael AI — the Directive CRM intelligence assistant for roofing sales.',
    inputSchema: { type: 'object' as const, properties: { message: { type: 'string' }, context: { type: 'string' } }, required: ['message'] },
  },
  {
    name: 'directive_assess_storm_risk',
    description: 'Assess storm risk for a property using weather alerts and hail history.',
    inputSchema: { type: 'object' as const, properties: { lat: { type: 'number' }, lng: { type: 'number' }, address: { type: 'string' } } },
  },
  {
    name: 'directive_full_property_report',
    description: 'Generate complete property intelligence report combining research, weather, and storm risk.',
    inputSchema: { type: 'object' as const, properties: { address: { type: 'string' }, response_format: { type: 'string', enum: ['markdown', 'json'] } }, required: ['address'] },
  },
];

// Request handler implementation
async function handleRequest(request: any): Promise<any> {
  if (request.method === 'tools/list') {
    return { tools };
  }

  if (request.method === 'tools/call') {
    const toolName = request.params?.name;
    const toolArgs = request.params?.arguments || {};

    try {
      switch (toolName) {
        case 'directive_research_property': {
          const input = AddressInputSchema.parse(toolArgs);
          const result = await directiveAPI.research(input.address);
          if (result.error || !result.data) throw new Error(`Research failed: ${result.error || 'Unknown error'}`);

          const leadScore = scoreLead({
            roofAgeYears: result.data.roofAgeYears,
            ownerPhone: result.data.ownerPhone,
            marketValue: result.data.marketValue,
            permitCount: result.data.permitCount,
          });

          const card: PropertyCard = {
            address: input.address,
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

          const output = input.response_format === 'markdown' ? formatPropertyCardMarkdown(card) : JSON.stringify(card, null, 2);
          return { content: [{ type: 'text', text: truncateOutput(output, CHARACTER_LIMIT) }] as TextContent[] };
        }

        case 'directive_geocode_address': {
          const input = SimpleAddressSchema.parse(toolArgs);
          const result = await directiveAPI.geocode(input.address);
          const output = `**Location:** ${result.display_name}\n**Latitude:** ${result.lat}\n**Longitude:** ${result.lng}`;
          return { content: [{ type: 'text', text: output }] as TextContent[] };
        }

        case 'directive_get_weather': {
          const input = CoordinatesOrAddressInputSchema.parse(toolArgs);
          let lat = input.lat, lng = input.lng;
          if (!lat || !lng) {
            const geo = await directiveAPI.geocode(input.address!);
            lat = geo.lat;
            lng = geo.lng;
          }
          const weather = await directiveAPI.getWeatherCurrent(lat, lng);
          const output = `**Conditions:** ${weather.conditions}\n**Temperature:** ${weather.temperature_f}°F\n**Wind:** ${weather.wind_speed_mph} mph from ${weather.wind_direction}\n**Humidity:** ${weather.humidity_pct}%\n**Pressure:** ${weather.pressure_inhg} inHg\n**Station:** ${weather.station}\n**Observed:** ${weather.observed_at}`;
          return { content: [{ type: 'text', text: output }] as TextContent[] };
        }

        case 'directive_get_weather_alerts': {
          const input = CoordinatesOrAddressInputSchema.parse(toolArgs);
          let lat = input.lat, lng = input.lng;
          if (!lat || !lng) {
            const geo = await directiveAPI.geocode(input.address!);
            lat = geo.lat;
            lng = geo.lng;
          }
          const alerts = await directiveAPI.getWeatherAlerts(lat, lng);
          if (alerts.length === 0) {
            return { content: [{ type: 'text', text: '## Weather Alerts\n\nNo active alerts.' }] as TextContent[] };
          }
          let output = '## Active Weather Alerts\n\n';
          alerts.forEach((alert) => {
            output += `### ${alert.event} (${alert.severity})\n**Headline:** ${alert.headline}\n**Valid:** ${alert.onset} to ${alert.expires}\n**Description:** ${alert.description}\n\n`;
          });
          return { content: [{ type: 'text', text: truncateOutput(output, CHARACTER_LIMIT) }] as TextContent[] };
        }

        case 'directive_get_forecast': {
          const input = ForecastInputSchema.parse(toolArgs);
          let lat = input.lat, lng = input.lng;
          if (!lat || !lng) {
            const geo = await directiveAPI.geocode(input.address!);
            lat = geo.lat;
            lng = geo.lng;
          }
          const forecast = await directiveAPI.getWeatherForecast(lat, lng);
          const daytime = forecast.filter((p) => p.isDaytime).slice(0, input.days || 7);
          if (daytime.length === 0) {
            return { content: [{ type: 'text', text: 'No forecast data available.' }] as TextContent[] };
          }
          let output = '## Weather Forecast\n\n';
          daytime.forEach((period) => {
            output += `### ${period.name}\n**Temperature:** ${period.temperature}°${period.temperatureUnit}\n**Wind:** ${period.windSpeed} from ${period.windDirection}\n**Forecast:** ${period.shortForecast}\n\n`;
          });
          return { content: [{ type: 'text', text: truncateOutput(output, CHARACTER_LIMIT) }] as TextContent[] };
        }

        case 'directive_get_hail_events': {
          const input = HailInputSchema.parse(toolArgs);
          let lat = input.lat, lng = input.lng;
          if (!lat || !lng) {
            const geo = await directiveAPI.geocode(input.address!);
            lat = geo.lat;
            lng = geo.lng;
          }
          const events = await directiveAPI.getHailEvents(lat, lng, input.days, input.radius_miles);
          if (events.length === 0) {
            const output = `No hail events found in past ${input.days} days.`;
            return { content: [{ type: 'text', text: output }] as TextContent[] };
          }
          let output = `## Hail Events (Past ${input.days} Days)\n\n`;
          if (input.response_format === 'markdown') {
            events.forEach((event) => {
              output += `- **${event.date}:** ${event.size}" hail (${event.severity}) at (${event.lat}, ${event.lng})\n`;
            });
          } else {
            output = JSON.stringify(events, null, 2);
          }
          return { content: [{ type: 'text', text: truncateOutput(output, CHARACTER_LIMIT) }] as TextContent[] };
        }

        case 'directive_score_lead': {
          const input = LeadScoreInputSchema.parse(toolArgs);
          const score = scoreLead({
            roofAgeYears: input.roof_age_years,
            ownerPhone: input.owner_phone,
            marketValue: input.market_value,
            permitCount: input.permit_count,
          });
          const reasonsList = score.reasons.map((r) => `- ${r}`).join('\n');
          const output = `## Lead Score\n\n**Score:** ${score.score}/99\n**Confidence:** ${score.confidence}\n\n**Scoring Factors:**\n${reasonsList}`;
          return { content: [{ type: 'text', text: output }] as TextContent[] };
        }

        case 'directive_ask_michael': {
          const input = MichaelInputSchema.parse(toolArgs);
          const response = await directiveAPI.askMichael(input.message, input.context);
          return { content: [{ type: 'text', text: response.reply }] as TextContent[] };
        }

        case 'directive_assess_storm_risk': {
          const input = CoordinatesOrAddressInputSchema.parse(toolArgs);
          let lat = input.lat, lng = input.lng;
          if (!lat || !lng) {
            const geo = await directiveAPI.geocode(input.address!);
            lat = geo.lat;
            lng = geo.lng;
          }
          const [alerts, hailEvents] = await Promise.all([
            directiveAPI.getWeatherAlerts(lat, lng),
            directiveAPI.getHailEvents(lat, lng, 365),
          ]);
          const risk = assessStormRisk({ alerts, hailEvents });
          let output = `## Storm Risk Assessment\n\n**Risk Level:** ${risk.riskLevel}\n**Risk Score:** ${risk.score}/100\n\n**Contributing Factors:**\n`;
          risk.factors.forEach((f) => {
            output += `- ${f}\n`;
          });
          return { content: [{ type: 'text', text: output }] as TextContent[] };
        }

        case 'directive_full_property_report': {
          const input = AddressInputSchema.parse(toolArgs);
          const [researchResult, geocodeResult] = await Promise.all([
            directiveAPI.research(input.address),
            directiveAPI.geocode(input.address),
          ]);
          if (researchResult.error || !researchResult.data) {
            throw new Error(`Research failed: ${researchResult.error || 'Unknown error'}`);
          }
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

          const stormRisk = assessStormRisk({ alerts, hailEvents });

          const propertyCard: PropertyCard = {
            address: input.address,
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
          };

          const report: PropertyReport = {
            address: input.address,
            geocoding: {
              lat: geocodeResult.lat,
              lng: geocodeResult.lng,
              display_name: geocodeResult.display_name,
            },
            property: propertyCard,
            weather: { current: weather, alerts, forecast },
            stormRisk,
            hailEvents,
          };

          let output = '';
          if (input.response_format === 'markdown') {
            output = formatPropertyReportMarkdown(report);
          } else {
            output = JSON.stringify(report, null, 2);
          }
          output = truncateOutput(output, CHARACTER_LIMIT);
          return { content: [{ type: 'text', text: output }] as TextContent[] };
        }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }] as TextContent[],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown request method: ${request.method}`);
}

// Use the raw request handler (bypass type checking)
(server as any).setRequestHandler(handleRequest);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
