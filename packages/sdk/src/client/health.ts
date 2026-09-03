// Health and monitoring client

import { AxiosInstance } from 'axios';
import { HealthStatus, Metrics, VersionInfo } from '../types';

export class HealthClient {
  constructor(private http: AxiosInstance) {}

  /**
   * Check system health
   */
  async check(): Promise<HealthStatus> {
    const response = await this.http.get('/health');
    return response.data;
  }

  /**
   * Get system metrics
   */
  async getMetrics(): Promise<Metrics> {
    const response = await this.http.get('/metrics');
    return response.data;
  }

  /**
   * Get version information
   */
  async getVersion(): Promise<VersionInfo> {
    const response = await this.http.get('/version');
    return response.data;
  }
}
