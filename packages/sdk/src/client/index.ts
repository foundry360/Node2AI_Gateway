// Main SupernovaAI SDK Client

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  SupernovaClientConfig,
  ApiClient,
  ISupernovaClient,
  SupernovaSDKError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NetworkError,
  RateLimitError,
  ServerError,
} from '../types';
import { AuthClient } from './auth';
import { UsersClient } from './users';
import { ModelsClient } from './models';
import { SanitizationClient } from './sanitization';
import { ComplianceClient } from './compliance';
import { HealthClient } from './health';

export class SupernovaClient implements ApiClient, ISupernovaClient {
  private http: AxiosInstance;
  private config: SupernovaClientConfig;
  private token?: string;
  private refreshToken?: string;

  public readonly auth: AuthClient;
  public readonly users: UsersClient;
  public readonly models: ModelsClient;
  public readonly sanitization: SanitizationClient;
  public readonly compliance: ComplianceClient;
  public readonly health: HealthClient;

  constructor(config: SupernovaClientConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      debug: false,
      version: 'v1',
      ...config,
    };

    this.http = axios.create({
      baseURL: `${this.config.baseUrl}/api/${this.config.version}`,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SupernovaAI-SDK/1.0.0',
      },
    });

    // Setup request interceptor
    this.http.interceptors.request.use(
      config => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        if (this.config.apiKey) {
          config.headers['X-API-Key'] = this.config.apiKey;
        }
        return config;
      },
      error => Promise.reject(error)
    );

    // Setup response interceptor
    this.http.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config;

        // Handle 401 errors with token refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            await this.refreshAuthToken();
            return this.http(originalRequest);
          } catch (refreshError) {
            this.clearAuth();
            throw new AuthenticationError('Token refresh failed');
          }
        }

        // Handle rate limiting
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          throw new RateLimitError(
            'Rate limit exceeded',
            retryAfter ? parseInt(retryAfter) : undefined
          );
        }

        // Handle other HTTP errors
        if (error.response) {
          const statusCode = error.response.status;
          const message = error.response.data?.message || error.message;

          if (statusCode === 400) {
            throw new ValidationError(message, error.response.data?.field);
          } else if (statusCode === 401) {
            throw new AuthenticationError(message);
          } else if (statusCode === 403) {
            throw new AuthorizationError(message);
          } else if (statusCode >= 500) {
            throw new ServerError(message, statusCode);
          }
        }

        // Handle network errors
        if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND') {
          throw new NetworkError('Network connection failed', error);
        }

        throw new SupernovaSDKError(
          error.message || 'Unknown error occurred',
          'UNKNOWN_ERROR',
          error.response?.status
        );
      }
    );

    // Initialize client modules
    this.auth = new AuthClient(this.http, this);
    this.users = new UsersClient(this.http);
    this.models = new ModelsClient(this.http);
    this.sanitization = new SanitizationClient(this.http);
    this.compliance = new ComplianceClient(this.http);
    this.health = new HealthClient(this.http);
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string, refreshToken?: string): void {
    this.token = token;
    this.refreshToken = refreshToken;
  }

  /**
   * Clear authentication tokens
   */
  clearAuth(): void {
    this.token = undefined;
    this.refreshToken = undefined;
  }

  /**
   * Get current authentication status
   */
  isAuthenticated(): boolean {
    return !!this.token;
  }

  /**
   * Refresh authentication token
   */
  private async refreshAuthToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new AuthenticationError('No refresh token available');
    }

    try {
      const response = await this.http.post('/auth/refresh', {
        refreshToken: this.refreshToken,
      });

      const { token, refreshToken } = response.data;
      this.setAuthToken(token, refreshToken);
    } catch (error) {
      throw new AuthenticationError('Token refresh failed');
    }
  }

  /**
   * Make a raw HTTP request
   */
  async request<T = any>(
    config: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.http.request<T>(config);
  }

  /**
   * Get HTTP client instance
   */
  getHttpClient(): AxiosInstance {
    return this.http;
  }

  /**
   * Get client configuration
   */
  getConfig(): SupernovaClientConfig {
    return { ...this.config };
  }

  /**
   * Update client configuration
   */
  updateConfig(updates: Partial<SupernovaClientConfig>): void {
    this.config = { ...this.config, ...updates };

    // Update HTTP client if base URL changed
    if (updates.baseUrl) {
      this.http.defaults.baseURL = `${updates.baseUrl}/api/${this.config.version}`;
    }
  }
}

/**
 * Create a new SupernovaAI client instance
 */
export function createClient(config: SupernovaClientConfig): SupernovaClient {
  return new SupernovaClient(config);
}

/**
 * Create a client with environment variables
 */
export function createClientFromEnv(): SupernovaClient {
  const config: SupernovaClientConfig = {
    baseUrl: process.env.SUPERNOVA_BASE_URL || 'http://localhost:3001',
    apiKey: process.env.SUPERNOVA_API_KEY || '',
    timeout: process.env.SUPERNOVA_TIMEOUT
      ? parseInt(process.env.SUPERNOVA_TIMEOUT)
      : undefined,
    debug: process.env.SUPERNOVA_DEBUG === 'true',
    version: process.env.SUPERNOVA_VERSION || 'v1',
  };

  return new SupernovaClient(config);
}

// Export types
export * from '../types';

// Export all client classes
export { AuthClient } from './auth';
export { UsersClient } from './users';
export { ModelsClient } from './models';
export { SanitizationClient } from './sanitization';
export { ComplianceClient } from './compliance';
export { HealthClient } from './health';
