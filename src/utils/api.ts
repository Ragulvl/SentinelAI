import { API_URL } from '../config/api';

// ── Unified API client ────────────────────────────────────────────────────────
// All requests send credentials: 'include' so the browser automatically
// attaches the httpOnly auth cookie. No Authorization header needed.
// The server's CORS config allows credentials from the frontend origin.

function handleUnauthorized() {
  // Cookie expired / invalid — redirect to login
  window.location.href = '/login';
}

async function parseError(response: Response) {
  let errorData: any;
  try {
    errorData = await response.json();
  } catch {
    errorData = { error: response.statusText };
  }
  const error: any = new Error(
    errorData.error || errorData.message || `API Error: ${response.statusText}`
  );
  error.response = { data: errorData, status: response.status };
  return error;
}

const BASE_OPTS: RequestInit = {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
};

export class ApiClient {
  static async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_URL}${endpoint}`, {
          credentials: 'include',
      method: 'GET',
      ...BASE_OPTS,
    });
    if (!response.ok) {
      if (response.status === 401) handleUnauthorized();
      throw await parseError(response);
    }
    return response.json();
  }

  static async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${API_URL}${endpoint}`, {
          credentials: 'include',
      method: 'POST',
      ...BASE_OPTS,
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!response.ok) {
      if (response.status === 401) handleUnauthorized();
      throw await parseError(response);
    }
    return response.json();
  }

  static async put<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${API_URL}${endpoint}`, {
          credentials: 'include',
      method: 'PUT',
      ...BASE_OPTS,
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!response.ok) {
      if (response.status === 401) handleUnauthorized();
      throw await parseError(response);
    }
    return response.json();
  }

  static async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${API_URL}${endpoint}`, {
          credentials: 'include',
      method: 'PATCH',
      ...BASE_OPTS,
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!response.ok) {
      if (response.status === 401) handleUnauthorized();
      throw await parseError(response);
    }
    return response.json();
  }

  static async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_URL}${endpoint}`, {
          credentials: 'include',
      method: 'DELETE',
      ...BASE_OPTS,
    });
    if (!response.ok) {
      if (response.status === 401) handleUnauthorized();
      throw await parseError(response);
    }
    return response.json();
  }
}
