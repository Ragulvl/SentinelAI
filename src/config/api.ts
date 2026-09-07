// In production: use relative URLs ("") so all /api/* calls go through the Vercel rewrite proxy
// at sentinalsec.vercel.app/api/*. The proxy forwards Cookie headers to the backend, solving
// the cross-domain httpOnly cookie issue (cookie set on sentinalsec.vercel.app, stays same-site).
// In local dev, VITE_API_URL falls back to http://localhost:5000.
const rawApiUrl = import.meta.env.VITE_API_URL;
export const API_URL = import.meta.env.PROD
  ? ''  // Relative URLs — proxy at sentinalsec.vercel.app handles /api/* rewrites
  : (rawApiUrl && rawApiUrl !== 'http://localhost:5000' ? rawApiUrl : 'http://localhost:5000');

export const API_BASE_URL = API_URL; // Alias for compatibility

export const API_ENDPOINTS = {
  auth: {
    github: `${API_URL}/api/auth/github`,
    verify: `${API_URL}/api/auth/verify`,
    logout: `${API_URL}/api/auth/logout`,
    repositories: `${API_URL}/api/auth/repositories`,
    promoteSelf: `${API_URL}/api/auth/promote-self`,
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
