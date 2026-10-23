import crypto from 'node:crypto';
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
export function createResetToken() {
  return crypto.randomBytes(32).toString('base64url');
}
export function hashResetToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
export function normalizeRecoveryCode(input: string) {
  const cleaned = String(input).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.startsWith('ROV') ? cleaned.slice(3) : cleaned;
}
export function hashRecoveryCode(code: string) {
  return crypto.createHash('sha256').update('roviel-recovery:' + normalizeRecoveryCode(code)).digest('hex');
}
export function createRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const hex = crypto.randomBytes(10).toString('hex').toUpperCase();
    return 'ROV-' + hex.match(/.{4}/g)!.join('-');
  });
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
