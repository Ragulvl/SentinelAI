import { ApiClient } from '@/utils/api';

export interface MonitoredSite {
  _id: string;
  userId: string;
  url: string;
  name: string;
  monitorType: 'http' | 'keyword' | 'port';
  keyword?: string;
  keywordPresent?: boolean;
  expectedStatus?: number;
  port?: number;
  status: 'up' | 'down' | 'degraded';
  statusCode?: number | null;
  responseTime: number;
  uptime: number;
  sslValid: boolean;
  sslExpiry: string | null;
  sslDaysLeft?: number | null;
  lastChecked: string;
  responseHistory: number[];
  statusHistory: ('up' | 'down' | 'degraded')[];
  incidents?: any[];
  checkInterval: number;
  createdAt: string;
  updatedAt: string;
}

export interface AddSiteRequest {
  url: string;
  name?: string;
  checkInterval?: number;
  monitorType?: 'http' | 'keyword' | 'port';
  keyword?: string;
  keywordPresent?: boolean;
  expectedStatus?: number;
  port?: number;
}

export interface TestUrlRequest {
  url: string;
  monitorType?: string;
  keyword?: string;
  keywordPresent?: boolean;
  expectedStatus?: number;
  port?: number;
}

export interface TestUrlResult {
  reachable: boolean;
  status?: string;
  statusCode?: number | null;
  responseTime?: number;
  sslValid?: boolean;
  sslDaysLeft?: number | null;
  keywordFound?: boolean;
  error?: string;
  normalizedUrl?: string;
}

export const monitoringService = {
  async getSites(): Promise<MonitoredSite[]> {
    return ApiClient.get('/api/monitoring');
  },

  async addSite(data: AddSiteRequest): Promise<MonitoredSite> {
    return ApiClient.post('/api/monitoring', data);
  },

  async testUrl(data: TestUrlRequest): Promise<TestUrlResult> {
    return ApiClient.post('/api/monitoring/check', data);
  },

  async refreshSite(siteId: string): Promise<MonitoredSite> {
    return ApiClient.post(`/api/monitoring/${siteId}/refresh`);
  },

  async refreshAllSites(): Promise<MonitoredSite[]> {
    return ApiClient.post('/api/monitoring/refresh');
  },

  async removeSite(siteId: string): Promise<void> {
    return ApiClient.delete(`/api/monitoring/${siteId}`);
  },

  async updateCheckInterval(siteId: string, checkInterval: number): Promise<MonitoredSite> {
    return ApiClient.patch(`/api/monitoring/${siteId}/interval`, { checkInterval });
  },
};
