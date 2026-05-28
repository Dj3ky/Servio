import 'dotenv/config';

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: parseInt(optional('PORT', '3001'), 10),
  frontendUrl: optional('FRONTEND_URL', 'http://localhost:3000'),

  databaseUrl: required('DATABASE_URL'),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '8h'),

  encryptionKey: required('ENCRYPTION_KEY'),

  uploadMaxSize: 50 * 1024 * 1024,
} as const;
