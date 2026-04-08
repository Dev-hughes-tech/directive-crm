import { LeadScore, StormRisk, WeatherAlert, HailEvent } from '../types.js';
export declare function scoreLead(options: {
    roofAgeYears?: number | null;
    ownerPhone?: string | null;
    marketValue?: number | null;
    permitCount?: number | null;
}): LeadScore;
export declare function assessStormRisk(options: {
    alerts: WeatherAlert[];
    hailEvents: HailEvent[];
    recentHailDays?: number;
}): StormRisk;
export declare function truncateOutput(text: string, limit: number): string;
export declare function formatMarkdown(data: Record<string, unknown>): string;
//# sourceMappingURL=scoring.d.ts.map