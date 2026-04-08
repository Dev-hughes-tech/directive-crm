import { ResearchResponse, GeocodeResponse, WeatherCurrentResponse, WeatherAlert, ForecastPeriod, HailEvent, MichaelResponse, MichaelMessage } from '../types.js';
export declare class DirectiveAPI {
    private client;
    constructor();
    research(address: string): Promise<ResearchResponse>;
    geocode(address: string): Promise<GeocodeResponse>;
    getWeatherCurrent(lat: number, lng: number): Promise<WeatherCurrentResponse>;
    getWeatherAlerts(lat: number, lng: number): Promise<WeatherAlert[]>;
    getWeatherForecast(lat: number, lng: number): Promise<ForecastPeriod[]>;
    getHailEvents(lat: number, lng: number, days?: number, radiusMiles?: number): Promise<HailEvent[]>;
    askMichael(message: string, context?: string, previousMessages?: MichaelMessage[]): Promise<MichaelResponse>;
}
export declare const directiveAPI: DirectiveAPI;
//# sourceMappingURL=api.d.ts.map