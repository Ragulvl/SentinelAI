import type { Request, Response, NextFunction } from 'express';
import { JWTService } from '../services/jwt.service.js';
import { User } from '../db/models/User.model.js';

export interface AdminRequest extends Request {
  adminUser?: {
    userId: number;
    username: string;
    role: string;
  };
}

/**
 * requireAdmin middleware
 * Matches the existing auth pattern (JWTService, githubId as userId).
 * Checks role === 'superadmin' | 'admin'.
 * Auto-promotes the designated SUPER_ADMIN_GITHUB username on first access.
 */
export const requireAdmin = async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Cookie-first (httpOnly) with Authorization header fallback
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Verify JWT using the same JWTService used everywhere else
    const payload = await JWTService.verifyToken(token); // throws on invalid/expired

    // Fetch user role from DB (payload.userId = githubId)
    const user = await User.findOne({ githubId: payload.userId }).select('username role isBanned githubId');
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    // Auto-promote the designated superadmin GitHub username
    const superAdminGithub = process.env.SUPER_ADMIN_GITHUB;
    if (superAdminGithub && user.username === superAdminGithub && user.role !== 'superadmin') {
      await User.findOneAndUpdate({ githubId: payload.userId }, { role: 'superadmin' });
      user.role = 'superadmin';
    }

    if (user.role !== 'superadmin' && user.role !== 'admin') {
      res.status(403).json({ error: 'Super admin access required' });
      return;
    }

    req.adminUser = { userId: payload.userId, username: user.username, role: user.role };
    next();
  } catch (error: any) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
