// Users client

import { AxiosInstance } from 'axios';
import {
  User,
  CreateUserRequest,
  UpdateUserRequest,
  Permission,
  ListOptions,
  PaginatedResponse,
} from '../types';

export class UsersClient {
  constructor(private http: AxiosInstance) {}

  /**
   * List users with pagination and filtering
   */
  async list(options: ListOptions = {}): Promise<PaginatedResponse<User>> {
    const params = new URLSearchParams();

    if (options.page) params.append('page', options.page.toString());
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.sort) params.append('sort', options.sort);
    if (options.order) params.append('order', options.order);
    if (options.search) params.append('search', options.search);
    if (options.filter) {
      Object.entries(options.filter).forEach(([key, value]) => {
        params.append(`filter[${key}]`, value.toString());
      });
    }

    const response = await this.http.get(`/users?${params.toString()}`);
    return response.data;
  }

  /**
   * Get user by ID
   */
  async get(id: string): Promise<User> {
    const response = await this.http.get(`/users/${id}`);
    return response.data;
  }

  /**
   * Create a new user
   */
  async create(user: CreateUserRequest): Promise<User> {
    const response = await this.http.post('/users', user);
    return response.data;
  }

  /**
   * Update user
   */
  async update(id: string, user: UpdateUserRequest): Promise<User> {
    const response = await this.http.put(`/users/${id}`, user);
    return response.data;
  }

  /**
   * Delete user
   */
  async delete(id: string): Promise<void> {
    await this.http.delete(`/users/${id}`);
  }

  /**
   * Get user permissions
   */
  async getPermissions(id: string): Promise<Permission[]> {
    const response = await this.http.get(`/users/${id}/permissions`);
    return response.data;
  }

  /**
   * Update user permissions
   */
  async updatePermissions(
    id: string,
    permissions: Permission[]
  ): Promise<void> {
    await this.http.put(`/users/${id}/permissions`, { permissions });
  }
}
