import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config/env.js';
import type { JWTPayload } from '../types/auth.js';

// jose requires a Uint8Array secret — encode once
const getSecret = () => new TextEncoder().encode(config.jwt.secret);

export class JWTService {
  static async generateToken(payload: JWTPayload): Promise<string> {
    return new SignJWT({ ...payload } as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(getSecret());
  }

  static async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, getSecret());
      return payload as unknown as JWTPayload;
    } catch {
      throw new Error('Invalid or expired token');
    }
  }
}
