import type { Request, Response } from 'express';
import { GitHubAuthService } from '../services/githubAuth.service.js';
import { JWTService } from '../services/jwt.service.js';
import { UserService } from '../services/user.service.js';
import { config } from '../config/env.js';
import type { AuthResponse } from '../types/auth.js';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Stateless CSRF state: nonce + expiry encoded as "nonce:expiry", signed with
// HMAC-SHA256(JWT_SECRET). Works across restarts and multiple instances.
// ---------------------------------------------------------------------------
function createOAuthState(): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiry = Date.now() + 10 * 60 * 1000; // 10 min
  const payload = `${nonce}:${expiry}`;
  const sig = crypto.createHmac('sha256', config.jwt.secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function verifyOAuthState(state: string): boolean {
  try {
    const decoded = Buffer.from(state, 'base64url').toString();
    const lastColon = decoded.lastIndexOf(':');
    const payload = decoded.substring(0, lastColon);
    const sig = decoded.substring(lastColon + 1);
    const expectedSig = crypto.createHmac('sha256', config.jwt.secret).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) return false;
    const expiry = Number(payload.split(':')[1]);
    return Date.now() < expiry;
  } catch {
    return false;
  }
}

export class AuthController {
  static async initiateGitHubLogin(req: Request, res: Response) {
    try {
      const state = createOAuthState();
      const authUrl = GitHubAuthService.getAuthorizationUrl(state);
      res.json({ url: authUrl });
    } catch (error) {
      console.error('Error initiating GitHub login:', error);
      res.status(500).json({ error: 'Failed to initiate GitHub login' });
    }
  }

  static async handleGitHubCallback(req: Request, res: Response) {
    const { code, state } = req.query;

    try {
      // Verify state (HMAC-signed, stateless)
      if (!state || !verifyOAuthState(state as string)) {
        throw new Error('Invalid or expired state parameter');
      }

      if (!code) {
        throw new Error('No authorization code provided');
      }

      // Exchange code for access token
      const accessToken = await GitHubAuthService.getAccessToken(code as string);

      // Get user data from GitHub
      const githubUser = await GitHubAuthService.getUserData(accessToken);

      // Save or update user in MongoDB with access token
      const user = await UserService.createOrUpdateUser(githubUser, accessToken);

      // Generate JWT token
      const token = await JWTService.generateToken({
        userId: githubUser.id,
        username: githubUser.login,
        email: githubUser.email,
      });

      // Set httpOnly cookie — XSS-safe (not readable by JS)
      const isProd = config.nodeEnv === 'production';
      res.cookie('token', token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',  // 'none' needed for cross-origin (frontend/backend on different Vercel domains)
        maxAge: 7 * 24 * 60 * 60 * 1000,   // 7 days in ms
        path: '/',
      });

      // Redirect to frontend — NO token in URL (XSS-safe)
      res.redirect(`${config.frontendUrl}/auth/callback`);
    } catch (error) {
      console.error('Error in GitHub callback:', error);
      const errorUrl = `${config.frontendUrl}/login?error=${encodeURIComponent('Authentication failed')}`;
      res.redirect(errorUrl);
    }
  }

  static async verifyToken(req: Request, res: Response) {
    try {
      // Read token from httpOnly cookie first, fall back to Authorization header
      const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const payload = await JWTService.verifyToken(token);
      
      // Get user details from database
      const user = await UserService.getUserByGithubId(payload.userId);
      
      if (user) {
        res.json({ 
          valid: true, 
          user: {
            userId: user.githubId,
            username: user.username,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            bio: user.bio,
            company: user.company,
            location: user.location,
            firstLogin: user.firstLogin,
            lastLogin: user.lastLogin,
            lastActive: user.lastActive,
            loginCount: user.loginCount,
            role: user.role,           // ← ADDED: required for role-based access control
            isBanned: user.isBanned,   // ← ADDED: required to block banned users
          }
        });
      } else {
        res.json({ valid: true, user: payload });
      }
    } catch (error) {
      res.status(401).json({ valid: false, error: 'Invalid token' });
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      // Read token from cookie or header
      const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        try {
          const payload = await JWTService.verifyToken(token);
          const githubAccessToken = await UserService.getGithubAccessToken(payload.userId);
          if (githubAccessToken) {
            // DELETE /applications/{clientId}/grant  ← removes the ENTIRE OAuth app authorization.
            // This is different from /token (which only invalidates one token).
            // Deleting the grant forces GitHub to show the full "Authorize app" screen
            // the next time the user tries to log in, instead of silently re-issuing a token.
            const { default: axios } = await import('axios');
            await axios.delete(
              `https://api.github.com/applications/${config.github.clientId}/grant`,
              {
                auth: { username: config.github.clientId, password: config.github.clientSecret },
                data: { access_token: githubAccessToken },
                headers: { Accept: 'application/vnd.github.v3+json' },
                validateStatus: () => true,
              }
            );
          }
        } catch { /* non-critical — still clear local session */ }
      }
    } catch { /* ignore */ }

    // Clear the httpOnly cookie
    res.clearCookie('token', { path: '/', sameSite: 'none', secure: true });
    res.clearCookie('token', { path: '/', sameSite: 'lax' }); // dev fallback
    res.json({ success: true, message: 'Logged out successfully' });
  }

  static async getUserRepositories(req: Request, res: Response) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const payload = await JWTService.verifyToken(token);
      
      // Get user's GitHub access token
      const githubAccessToken = await UserService.getGithubAccessToken(payload.userId);
      
      if (!githubAccessToken) {
        return res.status(401).json({ error: 'GitHub access token not found. Please re-authenticate.' });
      }

      // Fetch repositories from GitHub
      const repositories = await GitHubAuthService.getUserRepositories(githubAccessToken);
      
      res.json({ repositories });
    } catch (error: any) {
      console.error('Error fetching repositories:', error);
      const msg = error?.message || 'Failed to fetch repositories';
      if (msg.includes('re-authenticate') || msg.includes('invalid or expired')) {
        return res.status(401).json({ error: msg });
      }
      res.status(500).json({ error: msg });
    }
  }

  static async getRepositoryBranches(req: Request, res: Response) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const payload = await JWTService.verifyToken(token);
      const { owner, repo } = req.params;
      
      // Get user's GitHub access token
      const githubAccessToken = await UserService.getGithubAccessToken(payload.userId);
      
      if (!githubAccessToken) {
        return res.status(401).json({ error: 'GitHub access token not found. Please re-authenticate.' });
      }

      // Fetch branches from GitHub
      const branches = await GitHubAuthService.getRepositoryBranches(owner, repo, githubAccessToken);
      
      res.json({ branches });
    } catch (error) {
      console.error('Error fetching branches:', error);
      res.status(500).json({ error: 'Failed to fetch branches' });
    }
  }

  /**
   * POST /api/auth/promote-self
   * Bootstrap endpoint — no admin privilege required.
   * Promotes the caller to superadmin IF their GitHub username matches
   * the SUPER_ADMIN_GITHUB environment variable.
   * Solves the chicken-and-egg: AdminRoute blocks non-admins, but the
   * only way to become admin was to hit an admin route first.
   */
  static async promoteSelf(req: Request, res: Response) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const payload = await JWTService.verifyToken(token);
      const { User } = await import('../db/models/User.model.js');

      const user = await User.findOne({ githubId: payload.userId }).select('username role githubId');
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const superAdminGithub = process.env.SUPER_ADMIN_GITHUB;

      // Already an admin or superadmin — return current role
      if (user.role === 'admin' || user.role === 'superadmin') {
        res.json({ role: user.role, promoted: false, message: `Already ${user.role}` });
        return;
      }

      // Not the designated superadmin
      if (!superAdminGithub || user.username !== superAdminGithub) {
        res.status(403).json({ error: 'Not the designated super admin', role: user.role });
        return;
      }

      // Promote to superadmin
      await User.findOneAndUpdate({ githubId: payload.userId }, { role: 'superadmin' });
      res.json({ role: 'superadmin', promoted: true, message: 'Promoted to superadmin' });
    } catch (error: any) {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  }
}
