import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export interface TokenPayload { sub: string; ver: number }

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}
export function signToken(userId: string, tokenVersion = 0) {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return jwt.sign({ sub: userId, ver: tokenVersion }, secret, { expiresIn: (process.env.JWT_EXPIRES_IN || '12h') as any });
}
export function verifyToken(token: string): TokenPayload | null {
  try {
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const p = jwt.verify(token, secret) as any;
    if (typeof p?.sub !== 'string') return null;
    return { sub: p.sub, ver: typeof p.ver === 'number' ? p.ver : -1 };
  } catch { return null; }
}
