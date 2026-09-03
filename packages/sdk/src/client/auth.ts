// Authentication client

import { AxiosInstance } from 'axios';
import {
  LoginCredentials,
  AuthResponse,
  ChangePasswordRequest,
  User,
  ISupernovaClient,
} from '../types';

export class AuthClient {
  constructor(
    private http: AxiosInstance,
    private client: ISupernovaClient
  ) {}

  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await this.http.post('/auth/login', credentials);
    const authResponse: AuthResponse = response.data;

    // Set tokens in client
    this.client.setAuthToken(authResponse.token, authResponse.refreshToken);

    return authResponse;
  }

  /**
   * Logout and clear tokens
   */
  async logout(): Promise<void> {
    try {
      await this.http.post('/auth/logout');
    } finally {
      this.client.clearAuth();
    }
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(): Promise<AuthResponse> {
    const response = await this.http.post('/auth/refresh');
    const authResponse: AuthResponse = response.data;

    // Update tokens in client
    this.client.setAuthToken(authResponse.token, authResponse.refreshToken);

    return authResponse;
  }

  /**
   * Get current user profile
   */
  async getProfile(): Promise<User> {
    const response = await this.http.get('/auth/profile');
    return response.data;
  }

  /**
   * Change user password
   */
  async changePassword(request: ChangePasswordRequest): Promise<void> {
    await this.http.post('/auth/change-password', request);
  }
}
