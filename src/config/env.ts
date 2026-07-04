import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  MONGODB_URI: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  CLIENT_URL: string;
  /** This server's own public origin, used to turn locally-uploaded file paths (e.g. /uploads/products/x.png) into absolute URLs the client can load. */
  PUBLIC_URL: string;
}

const REQUIRED_VARS = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

function loadEnv(): EnvConfig {
  const missing: string[] = REQUIRED_VARS.filter((key) => !process.env[key] || process.env[key]?.trim() === '');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill in the values before starting the server.',
    );
  }

  const nodeEnv = (process.env.NODE_ENV ?? 'development') as EnvConfig['NODE_ENV'];
  const port = Number(process.env.PORT) || 5000;

  return {
    PORT: port,
    NODE_ENV: nodeEnv,
    MONGODB_URI: process.env.MONGODB_URI as string,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET as string,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string,
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    CLIENT_URL: process.env.CLIENT_URL ?? 'http://localhost:5173',
    PUBLIC_URL: process.env.PUBLIC_URL ?? `http://localhost:${port}`,
  };
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
