// Compliance client

import { AxiosInstance } from 'axios';
import {
  ComplianceReport,
  AuditLog,
  ComplianceFinding,
  GenerateReportRequest,
  AuditLogOptions,
  FindingsOptions,
  ListOptions,
  PaginatedResponse,
} from '../types';

export class ComplianceClient {
  constructor(private http: AxiosInstance) {}

  /**
   * List compliance reports
   */
  async getReports(
    options: ListOptions = {}
  ): Promise<PaginatedResponse<ComplianceReport>> {
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
      `/compliance/reports?${params.toString()}`
    );
    return response.data;
  }

  /**
   * Generate a new compliance report
   */
  async generateReport(
    request: GenerateReportRequest
  ): Promise<ComplianceReport> {
    const response = await this.http.post('/compliance/reports', request);
    return response.data;
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(
    options: AuditLogOptions = {}
  ): Promise<PaginatedResponse<AuditLog>> {
    const params = new URLSearchParams();

    if (options.page) params.append('page', options.page.toString());
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.sort) params.append('sort', options.sort);
    if (options.order) params.append('order', options.order);
    if (options.userId) params.append('userId', options.userId);
    if (options.action) params.append('action', options.action);
    if (options.resource) params.append('resource', options.resource);
    if (options.severity) params.append('severity', options.severity);
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);

    const response = await this.http.get(
      `/compliance/audit-logs?${params.toString()}`
    );
    return response.data;
  }

  /**
   * Get compliance findings
   */
  async getFindings(
    options: FindingsOptions = {}
  ): Promise<ComplianceFinding[]> {
    const params = new URLSearchParams();

    if (options.category) params.append('category', options.category);
    if (options.severity) params.append('severity', options.severity);
    if (options.status) params.append('status', options.status);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());

    const response = await this.http.get(
      `/compliance/findings?${params.toString()}`
    );
    return response.data;
  }

  /**
   * Export compliance report
   */
  async exportReport(
    id: string,
    format: 'pdf' | 'csv' | 'json'
  ): Promise<Blob> {
    const response = await this.http.get(`/compliance/reports/${id}/export`, {
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  }
}
