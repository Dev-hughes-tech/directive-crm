import axios from 'axios';
import { API_BASE_URL } from '../constants.js';
export class DirectiveAPI {
    constructor() {
        this.client = axios.create({
            baseURL: API_BASE_URL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    async research(address) {
        try {
            const response = await this.client.post('/api/research', {
                address,
            });
            return response.data;
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Research API error: ${error.response?.status || error.message}. Address: ${address}`);
            }
            throw error;
        }
    }
    async geocode(address) {
        try {
            const response = await this.client.get('/api/geocode', {
                params: { q: address },
            });
            return response.data;
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Geocoding failed for "${address}". Try including city and state (e.g., "924 12th St SW, Fayette, AL")`);
            }
            throw error;
        }
    }
    async getWeatherCurrent(lat, lng) {
        try {
            const response = await this.client.get('/api/weather/current', {
                params: { lat, lng },
            });
            return response.data;
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Weather API error at (${lat}, ${lng}): ${error.response?.status || error.message}`);
            }
            throw error;
        }
    }
    async getWeatherAlerts(lat, lng) {
        try {
            const response = await this.client.get('/api/weather/alerts', {
                params: { lat, lng },
            });
            return response.data;
        }
        catch (error) {
            // Alerts may return 404 if none exist - that's OK
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return [];
            }
            if (axios.isAxiosError(error)) {
                throw new Error(`Weather alerts API error at (${lat}, ${lng}): ${error.response?.status || error.message}`);
            }
            throw error;
        }
    }
    async getWeatherForecast(lat, lng) {
        try {
            const response = await this.client.get('/api/weather/forecast', {
                params: { lat, lng },
            });
            return response.data;
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Weather forecast API error at (${lat}, ${lng}): ${error.response?.status || error.message}`);
            }
            throw error;
        }
    }
    async getHailEvents(lat, lng, days = 365, radiusMiles) {
        try {
            const params = { lat, lng, days };
            if (radiusMiles) {
                params.radius_miles = radiusMiles;
            }
            const response = await this.client.get('/api/noaa/hail', { params });
            return response.data;
        }
        catch (error) {
            // Hail events may return 404 if none exist - that's OK
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return [];
            }
            if (axios.isAxiosError(error)) {
                throw new Error(`NOAA hail API error at (${lat}, ${lng}): ${error.response?.status || error.message}`);
            }
            throw error;
        }
    }
    async askMichael(message, context, previousMessages) {
        try {
            const messages = previousMessages || [];
            messages.push({ role: 'user', content: message });
            const payload = { messages };
            if (context) {
                payload.context = context;
            }
            const response = await this.client.post('/api/michael', payload);
            return response.data;
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Michael AI API error: ${error.response?.status || error.message}`);
            }
            throw error;
        }
    }
}
export const directiveAPI = new DirectiveAPI();
//# sourceMappingURL=api.js.map