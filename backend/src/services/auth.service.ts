import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { prisma } from '../db.js';
import { JWT_SECRET, IS_PRODUCTION } from '../config.js';
import { LoginInput } from '../schemas/auth.schema.js';

export const AUTH_COOKIE_NAME = 'auth_token';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface PublicUser {
  email: string;
  role: UserRole;
}

export function getAuthCookieOptions(isProduction = IS_PRODUCTION) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: isProduction,
    path: '/',
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  };
}

export function getClearCookieOptions(isProduction = IS_PRODUCTION) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: isProduction,
    path: '/'
  };
}

export async function authenticateCredentials(
  input: LoginInput,
  customPrisma = prisma
): Promise<{ token: string; user: PublicUser } | null> {
  const normalizedEmail = input.email.toLowerCase().trim();
  const user = await customPrisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (!user) {
    return null;
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!isPasswordValid) {
    return null;
  }

  const payload: AuthTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '8h'
  });

  return {
    token,
    user: {
      email: user.email,
      role: user.role
    }
  };
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256']
  }) as AuthTokenPayload;
}

export async function getUserProfile(
  userId: string,
  customPrisma = prisma
): Promise<PublicUser | null> {
  return customPrisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      role: true
    }
  });
}
