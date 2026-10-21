import 'dotenv/config';

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

export const PORT = Number(process.env.PORT || 5000);
export const DATABASE_URL = process.env.DATABASE_URL?.trim() || '';
export const JWT_SECRET = process.env.JWT_SECRET?.trim() || '';

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

if (!DATABASE_URL && NODE_ENV !== 'test') {
  throw new Error('DATABASE_URL is required');
}

if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long');
}

const rawOrigins = process.env.ALLOWED_ORIGINS?.trim();

if (IS_PRODUCTION && !rawOrigins) {
  throw new Error('ALLOWED_ORIGINS must be configured in production');
}

export const ALLOWED_ORIGINS = (
  rawOrigins || 'http://localhost:5173'
)
  .split(',')
  .map((origin) => origin.trim());

if (ALLOWED_ORIGINS.some((origin) => !origin)) {
  throw new Error('ALLOWED_ORIGINS contains an empty entry');
}

for (const origin of ALLOWED_ORIGINS) {
  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    throw new Error('ALLOWED_ORIGINS contains an invalid origin');
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('ALLOWED_ORIGINS contains an invalid origin');
  }
}