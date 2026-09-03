/**
 * JWT Authentication Adapter
 *
 * This is an EXAMPLE implementation showing how to add JWT-based authentication
 * alongside Supabase Auth for customers using AWS RDS or standard PostgreSQL.
 *
 * To use: Set AUTH_PROVIDER=jwt in environment
 */

import { DatabaseAdapter } from '@node2/shared';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// ============================================================================
// Types
// ============================================================================

export interface AuthSession {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  user: AuthUser;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organization_id: string;
}

export interface AuthAdapter {
  signIn(email: string, password: string): Promise<AuthSession>;
  signUp(email: string, password: string, name: string): Promise<AuthUser>;
  signOut(token: string): Promise<void>;
  getSession(token: string): Promise<AuthSession | null>;
  verifyToken(token: string): Promise<AuthUser | null>;
}

// ============================================================================
// JWT Auth Adapter
// ============================================================================

export class JWTAuthAdapter implements AuthAdapter {
  private jwtSecret: string;
  private jwtExpiresIn: string;

  constructor(private db: DatabaseAdapter) {
    this.jwtSecret = process.env.JWT_SECRET || 'change-me-in-production';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
  }

  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string): Promise<AuthSession> {
    // Get user from database
    const user = await this.db.queryOne<any>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    // Check if account is active
    if (!user.is_active) {
      throw new Error('Account is deactivated');
    }

    // Create JWT token
    const token = this.createToken({
      userId: user.id,
      organizationId: user.organization_id,
      email: user.email,
      role: user.role,
    });

    // Update last login
    await this.db.execute(
      'UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1',
      [user.id]
    );

    return {
      access_token: token,
      expires_in: 86400, // 24 hours
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organization_id: user.organization_id,
      },
    };
  }

  /**
   * Sign up new user
   */
  async signUp(
    email: string,
    password: string,
    name: string
  ): Promise<AuthUser> {
    // Check if user already exists
    const existing = await this.db.queryOne(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing) {
      throw new Error('User already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Get default organization
    const org = await this.db.queryOne<any>(
      'SELECT id FROM organizations LIMIT 1'
    );

    if (!org) {
      throw new Error('No organization found');
    }

    // Create user
    const userId = require('crypto').randomUUID();

    await this.db.execute(
      `INSERT INTO users (id, email, name, password_hash, organization_id, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'user', true, NOW(), NOW())`,
      [userId, email, name, passwordHash, org.id]
    );

    return {
      id: userId,
      email,
      name,
      role: 'user',
      organization_id: org.id,
    };
  }

  /**
   * Sign out (in JWT, we just let the token expire)
   */
  async signOut(token: string): Promise<void> {
    // For JWT, we could:
    // 1. Add token to blacklist
    // 2. Just let it expire (simplest)

    // Option 1: Add to blacklist table
    try {
      await this.db.execute(
        'INSERT INTO token_blacklist (token, expires_at) VALUES ($1, $2)',
        [token, new Date(Date.now() + 86400 * 1000)] // 24 hours
      );
    } catch (error) {
      // Blacklist table might not exist - that's ok
      console.warn('Token blacklist not available');
    }
  }

  /**
   * Get session from token
   */
  async getSession(token: string): Promise<AuthSession | null> {
    try {
      // Check if token is blacklisted
      const blacklisted = await this.db.queryOne(
        'SELECT id FROM token_blacklist WHERE token = $1',
        [token]
      );

      if (blacklisted) {
        return null;
      }

      // Verify and decode token
      const payload = jwt.verify(token, this.jwtSecret) as any;

      // Get user from database
      const user = await this.db.queryOne<any>(
        'SELECT * FROM users WHERE id = $1',
        [payload.userId]
      );

      if (!user || !user.is_active) {
        return null;
      }

      return {
        access_token: token,
        expires_in: payload.exp - Math.floor(Date.now() / 1000),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organization_id: user.organization_id,
        },
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Verify token and return user
   */
  async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      return {
        id: decoded.userId,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
        organization_id: decoded.organizationId,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Create JWT token
   */
  private createToken(payload: {
    userId: string;
    organizationId: string;
    email: string;
    role: string;
  }): string {
    return jwt.sign(
      {
        userId: payload.userId,
        organizationId: payload.organizationId,
        email: payload.email,
        role: payload.role,
      },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn } as jwt.SignOptions
    );
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createAuthAdapter(db?: DatabaseAdapter): AuthAdapter {
  const authProvider = process.env.AUTH_PROVIDER || 'jwt';

  if (authProvider === 'jwt') {
    if (!db) {
      throw new Error('Database adapter required for JWT auth');
    }
    return new JWTAuthAdapter(db);
  }

  throw new Error(`Unsupported auth provider: ${authProvider}`);
}
