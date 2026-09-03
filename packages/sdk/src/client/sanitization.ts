// Data sanitization client

import { AxiosInstance } from 'axios';
import {
  SanitizationRule,
  SanitizationOptions,
  SanitizationResult,
  CreateRuleRequest,
  UpdateRuleRequest,
  TestRuleRequest,
  TestRuleResponse,
  ListOptions,
  PaginatedResponse,
} from '../types';

export class SanitizationClient {
  constructor(private http: AxiosInstance) {}

  /**
   * Sanitize text data
   */
  async sanitize(
    input: string,
    options: SanitizationOptions = {}
  ): Promise<SanitizationResult> {
    const response = await this.http.post('/sanitization/sanitize', {
      input,
      options,
    });
    return response.data;
  }

  /**
   * List sanitization rules
   */
  async getRules(
    options: ListOptions = {}
  ): Promise<PaginatedResponse<SanitizationRule>> {
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

    const response = await this.http.get(
      `/sanitization/rules?${params.toString()}`
    );
    return response.data;
  }

  /**
   * Create a new sanitization rule
   */
  async createRule(rule: CreateRuleRequest): Promise<SanitizationRule> {
    const response = await this.http.post('/sanitization/rules', rule);
    return response.data;
  }

  /**
   * Update sanitization rule
   */
  async updateRule(
    id: string,
    rule: UpdateRuleRequest
  ): Promise<SanitizationRule> {
    const response = await this.http.put(`/sanitization/rules/${id}`, rule);
    return response.data;
  }

  /**
   * Delete sanitization rule
   */
  async deleteRule(id: string): Promise<void> {
    await this.http.delete(`/sanitization/rules/${id}`);
  }

  /**
   * Test a sanitization rule
   */
  async testRule(rule: TestRuleRequest): Promise<TestRuleResponse> {
    const response = await this.http.post('/sanitization/test', rule);
    return response.data;
  }

  /**
   * Get available sanitization categories
   */
  async getCategories(): Promise<string[]> {
    const response = await this.http.get('/sanitization/categories');
    return response.data;
  }

  /**
   * Get available severity levels
   */
  async getSeverityLevels(): Promise<string[]> {
    const response = await this.http.get('/sanitization/severity-levels');
    return response.data;
  }
}
