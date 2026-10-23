import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/auth.js';
import { prisma } from '../lib/db.js';

export interface AuthedRequest extends Request { userId?: string }
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) { res.status(401).json({ error: 'Missing token' }); return; }
  const payload = verifyToken(token);
  if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }
  try {
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { tokenVersion: true } });
    if (!user || user.tokenVersion !== payload.ver) { res.status(401).json({ error: 'Session expired. Sign in again.' }); return; }
  } catch {
    res.status(503).json({ error: 'Service temporarily unavailable. Retry.' }); return;
  }
  req.userId = payload.sub;
  next();
}
