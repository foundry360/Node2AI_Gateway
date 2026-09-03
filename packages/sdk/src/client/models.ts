// AI Models client

import { AxiosInstance } from 'axios';
import {
  AIModel,
  CreateModelRequest,
  UpdateModelRequest,
  ModelTestResponse,
  ModelCapability,
  ListOptions,
  PaginatedResponse,
} from '../types';

export class ModelsClient {
  constructor(private http: AxiosInstance) {}

  /**
   * List AI models
   */
  async list(options: ListOptions = {}): Promise<PaginatedResponse<AIModel>> {
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

    const response = await this.http.get(`/models?${params.toString()}`);
    return response.data;
  }

  /**
   * Get model by ID
   */
  async get(id: string): Promise<AIModel> {
    const response = await this.http.get(`/models/${id}`);
    return response.data;
  }

  /**
   * Create a new AI model
   */
  async create(model: CreateModelRequest): Promise<AIModel> {
    const response = await this.http.post('/models', model);
    return response.data;
  }

  /**
   * Update AI model
   */
  async update(id: string, model: UpdateModelRequest): Promise<AIModel> {
    const response = await this.http.put(`/models/${id}`, model);
    return response.data;
  }

  /**
   * Delete AI model
   */
  async delete(id: string): Promise<void> {
    await this.http.delete(`/models/${id}`);
  }

  /**
   * Test AI model with input
   */
  async test(id: string, input: string): Promise<ModelTestResponse> {
    const response = await this.http.post(`/models/${id}/test`, { input });
    return response.data;
  }

  /**
   * Get available model capabilities
   */
  async getCapabilities(): Promise<ModelCapability[]> {
    const response = await this.http.get('/models/capabilities');
    return response.data;
  }
}
