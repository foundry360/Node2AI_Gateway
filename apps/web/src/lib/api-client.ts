/**
 * API Client Utility
 * Centralized API client for making requests to the Node2AI API server
 */

export const API_BASE_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Make an API request to the API server
 */
export async function apiClient(
  endpoint: string,
  options?: RequestInit
): Promise<any> {
  // Ensure endpoint starts with /
  const normalizedEndpoint = endpoint.startsWith('/')
    ? endpoint
    : `/${endpoint}`;

  const url = `${API_BASE_URL}${normalizedEndpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: `API Error: ${response.status}`,
      message: response.statusText,
    }));
    throw new Error(
      error.error || error.message || `API Error: ${response.status}`
    );
  }

  return response.json();
}

/**
 * Get API base URL (for manual fetch calls)
 */
export function getApiUrl(): string {
  return API_BASE_URL;
}
