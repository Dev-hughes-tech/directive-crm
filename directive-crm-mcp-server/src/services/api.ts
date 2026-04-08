import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL } from '../constants.js';
import {
  ResearchResponse,
  GeocodeResponse,
  WeatherCurrentResponse,
  WeatherAlert,
  ForecastPeriod,
  HailEvent,
  MichaelResponse,
  MichaelMessage,
} from '../types.js';

export class DirectiveAPI {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async research(address: string): Promise<ResearchResponse> {
    try {
      const response = await this.client.post<ResearchResponse>('/api/research', {
        address,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Research API error: ${error.response?.status || error.message}. Address: ${address}`
        );
      }
      throw error;
    }
  }

  async geocode(address: string): Promise<GeocodeResponse> {
    try {
      const response = await this.client.get<GeocodeResponse>('/api/geocode', {
        params: { q: address },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Geocoding failed for "${address}". Try including city and state (e.g., "924 12th St SW, Fayette, AL")`
        );
      }
      throw error;
    }
  }

  async getWeatherCurrent(lat: number, lng: number): Promise<WeatherCurrentResponse> {
    try {
      const response = await this.client.get<WeatherCurrentResponse>('/api/weather/current', {
        params: { lat, lng },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Weather API error at (${lat}, ${lng}): ${error.response?.status || error.message}`
        );
      }
      throw error;
    }
  }

  async getWeatherAlerts(lat: number, lng: number): Promise<WeatherAlert[]> {
    try {
      const response = await this.client.get<WeatherAlert[]>('/api/weather/alerts', {
        params: { lat, lng },
      });
      return response.data;
    } catch (error) {
      // Alerts may return 404 if none exist - that's OK
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return [];
      }
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Weather alerts API error at (${lat}, ${lng}): ${error.response?.status || error.message}`
        );
      }
      throw error;
    }
  }

  async getWeatherForecast(lat: number, lng: number): Promise<ForecastPeriod[]> {
    try {
      const response = await this.client.get<ForecastPeriod[]>('/api/weather/forecast', {
        params: { lat, lng },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Weather forecast API error at (${lat}, ${lng}): ${error.response?.status || error.message}`
        );
      }
      throw error;
    }
  }

  async getHailEvents(
    lat: number,
    lng: number,
    days: number = 365,
    radiusMiles?: number
  ): Promise<HailEvent[]> {
    try {
      const params: Record<string, number> = { lat, lng, days };
      if (radiusMiles) {
        params.radius_miles = radiusMiles;
      }
      const response = await this.client.get<HailEvent[]>('/api/noaa/hail', { params });
      return response.data;
    } catch (error) {
      // Hail events may return 404 if none exist - that's OK
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return [];
      }
      if (axios.isAxiosError(error)) {
        throw new Error(
          `NOAA hail API error at (${lat}, ${lng}): ${error.response?.status || error.message}`
        );
      }
      throw error;
    }
  }

  async askMichael(
    message: string,
    context?: string,
    previousMessages?: MichaelMessage[]
  ): Promise<MichaelResponse> {
    try {
      const messages: MichaelMessage[] = previousMessages || [];
      messages.push({ role: 'user', content: message });

      const payload: Record<string, unknown> = { messages };
      if (context) {
        payload.context = context;
      }

      const response = await this.client.post<MichaelResponse>('/api/michael', payload);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Michael AI API error: ${error.response?.status || error.message}`
        );
      }
      throw error;
    }
  }
}

export const directiveAPI = new DirectiveAPI();
