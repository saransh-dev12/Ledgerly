import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/auth.js';

export interface AuthedRequest extends Request { userId?: string }
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) { res.status(401).json({ error: 'Missing token' }); return; }
  const sub = verifyToken(token);
  if (!sub) { res.status(401).json({ error: 'Invalid token' }); return; }
  req.userId = sub;
  next();
}
