// In production (Vercel same-domain), VITE_API_URL should be left EMPTY in Vercel env vars.
// Empty string → relative URLs like /api/auth/github are used (same-domain, no CORS).
// In local dev, VITE_API_URL is not set at all → falls back to http://localhost:5000.
const rawApiUrl = import.meta.env.VITE_API_URL;
export const API_URL = (rawApiUrl !== undefined && rawApiUrl !== '') ? rawApiUrl : (import.meta.env.DEV ? 'http://localhost:5000' : '');

export const API_BASE_URL = API_URL; // Alias for compatibility

export const API_ENDPOINTS = {
  auth: {
    github: `${API_URL}/api/auth/github`,
    verify: `${API_URL}/api/auth/verify`,
    logout: `${API_URL}/api/auth/logout`,
    repositories: `${API_URL}/api/auth/repositories`,
    branches: (owner: string, repo: string) => `${API_URL}/api/auth/repositories/${owner}/${repo}/branches`,
  },
  scan: {
    start: `${API_URL}/api/scan/start`,
    status: (scanId: string) => `${API_URL}/api/scan/${scanId}/status`,
    results: (scanId: string) => `${API_URL}/api/scan/${scanId}/results`,
    history: `${API_URL}/api/scan/history`,
    createPR: (scanId: string) => `${API_URL}/api/scan/${scanId}/create-pr`,
    download: (scanId: string) => `${API_URL}/api/scan/${scanId}/download`,
    getFile: (scanId: string, filePath: string) => `${API_URL}/api/scan/${scanId}/file/${encodeURIComponent(filePath)}`,
    updateFile: (scanId: string, filePath: string) => `${API_URL}/api/scan/${scanId}/file/${encodeURIComponent(filePath)}`,
    sandboxScan: `${API_URL}/api/sandbox/start`,
    sandboxStatus: `${API_URL}/api/sandbox`,
  },
  websiteScan: {
    history: `${API_URL}/api/website-scan/history`,
    addOwnedDomain: `${API_URL}/api/website-scan/verify/add-owned`,
  },
  history: {
    all: `${API_URL}/api/history/all`,
    detail: (type: string, id: string) => `${API_URL}/api/history/${type}/${id}`,
  },
};
