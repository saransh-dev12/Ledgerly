import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}
export function signToken(userId: string) {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return jwt.sign({ sub: userId }, secret, { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any });
}
export function verifyToken(token: string): string | null {
  try {
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const p = jwt.verify(token, secret) as any;
    return p.sub as string;
  } catch { return null; }
}
