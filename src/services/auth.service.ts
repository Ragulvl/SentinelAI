import { API_ENDPOINTS } from '../config/api';

export interface User {
  userId: number;
  username: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  bio?: string;
  company?: string;
  location?: string;
  firstLogin?: string;
  lastLogin?: string;
  lastActive?: string;
  loginCount?: number;
  role?: 'user' | 'admin' | 'superadmin';
  isBanned?: boolean;
}

export class AuthService {
  static async initiateGitHubLogin(): Promise<void> {
    try {
      const response = await fetch(API_ENDPOINTS.auth.github);
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Failed to get authorization URL');
      }
    } catch (error) {
      console.error('Error initiating GitHub login:', error);
      throw error;
    }
  }

  // ── Token is now an httpOnly cookie — JS cannot read it (XSS-safe) ──────────
  // saveToken / getToken / removeToken are removed intentionally.
  // The browser sends the cookie automatically on all same-origin and
  // credentialed cross-origin requests. The server sets / clears it.

  static async verifyToken(): Promise<User | null> {
    try {
      const response = await fetch(API_ENDPOINTS.auth.verify, {
        // credentials: 'include' sends the httpOnly cookie automatically
        credentials: 'include',
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.user;
    } catch (error) {
      console.error('Error verifying token:', error);
      return null;
    }
  }

  static async logout(): Promise<void> {
    try {
      await fetch(API_ENDPOINTS.auth.logout, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Error during logout:', error);
    }
    // No localStorage to clear — server cleared the cookie
  }

  static async isAuthenticated(): Promise<boolean> {
    const user = await this.verifyToken();
    return user !== null;
  }
}
