import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../db/models/User.model.js';

/**
 * requireAdmin middleware
 * - Validates JWT from Authorization header or cookie
 * - Checks user role === 'superadmin'
 * - Returns 401/403 for unauthorized access
 */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Extract token from Authorization header or cookie
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : req.cookies?.token;

    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Verify JWT
    const decoded = jwt.verify(token, config.jwt.secret) as { userId: string };

    // Fetch user and check role
    const user = await User.findById(decoded.userId).select('username role isBanned');
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    // Auto-promote designated superadmin GitHub username
    const superAdminUsername = process.env.SUPER_ADMIN_GITHUB;
    if (superAdminUsername && user.username === superAdminUsername && user.role !== 'superadmin') {
      await User.findByIdAndUpdate(decoded.userId, { role: 'superadmin' });
      user.role = 'superadmin';
    }

    if (user.role !== 'superadmin' && user.role !== 'admin') {
      res.status(403).json({ error: 'Super admin access required' });
      return;
    }

    // Attach user to request
    (req as any).adminUser = { userId: decoded.userId, username: user.username, role: user.role };
    next();
  } catch (err: any) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};
