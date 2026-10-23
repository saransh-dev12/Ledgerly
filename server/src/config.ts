const insecureSecret = (secret: string | undefined) =>
  !secret || secret.length < 32 || /^(change-me|dev-secret)/i.test(secret);

export const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

export function assertConfig() {
  if (isProduction) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in production.');
    if (insecureSecret(process.env.JWT_SECRET)) {
      throw new Error('JWT_SECRET must be a random value of at least 32 characters in production.');
    }
    const origins = frontendOrigins();
    if (!origins.length || origins.includes('*')) {
      throw new Error('FRONTEND_URL must list explicit CORS origins in production.');
    }
  } else if (insecureSecret(process.env.JWT_SECRET)) {
    console.warn('[config] Using an insecure development JWT_SECRET. Set a random 32+ character value for production.');
  }
}

export function jwtSecret(): string {
  if (!insecureSecret(process.env.JWT_SECRET)) return process.env.JWT_SECRET!;
  if (isProduction) throw new Error('JWT_SECRET must be a random value of at least 32 characters in production.');
  return process.env.JWT_SECRET || 'dev-secret-only-local';
}

export function frontendOrigins(): string[] {
  const origins = (process.env.FRONTEND_URL || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!origins.length && !isProduction) return ['http://localhost:5173', 'http://127.0.0.1:5173'];
  return origins;
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return url;
}
