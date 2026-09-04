import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import type { JWTPayload } from '../types/auth.js';

export class JWTService {
  static generateToken(payload: JWTPayload): string {
    return jwt.sign(payload as object, config.jwt.secret, {
      expiresIn: '7d',
    });
  }

  static verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, config.jwt.secret) as JWTPayload;
    } catch {
      throw new Error('Invalid or expired token');
    }
  }
}
