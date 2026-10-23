import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { jwtSecret } from '../config.js';

export interface TokenPayload { sub: string; ver: number }

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}
export function signToken(userId: string, tokenVersion = 0) {
  return jwt.sign({ sub: userId, ver: tokenVersion }, jwtSecret(), { expiresIn: (process.env.JWT_EXPIRES_IN || '12h') as any });
}
export function verifyToken(token: string): TokenPayload | null {
  try {
    const p = jwt.verify(token, jwtSecret()) as any;
    if (typeof p?.sub !== 'string') return null;
    return { sub: p.sub, ver: typeof p.ver === 'number' ? p.ver : -1 };
  } catch { return null; }
}
