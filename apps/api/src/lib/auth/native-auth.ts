import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '7d';

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
}

export async function register(
  email: string,
  password: string,
  name: string,
  organizationId: string
) {
  const existing = await db.query(
    `SELECT id FROM users WHERE email = $1 AND auth_provider = 'native'`,
    [email.toLowerCase()]
  );

  if (existing.rows.length > 0) {
    throw new Error('User already exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await db.query(
    `
    INSERT INTO users (
      id,
      email,
      name,
      password_hash,
      role,
      is_active,
      organization_id,
      auth_provider,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      $1,
      $2,
      $3,
      'admin',
      true,
      $4,
      'native',
      NOW(),
      NOW()
    )
    RETURNING id, email, name, role, organization_id
  `,
    [email.toLowerCase(), name, passwordHash, organizationId]
  );

  return user.rows[0];
}

export async function login(email: string, password: string) {
  const result = await db.query(
    `
    SELECT 
      id, 
      email, 
      name, 
      password_hash, 
      role, 
      organization_id, 
      is_active,
      avatar_url,
      phone,
      display_name
    FROM users
    WHERE email = $1
      AND auth_provider = 'native'
    LIMIT 1
  `,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid credentials');
  }

  const user = result.rows[0];

  if (!user.is_active) {
    throw new Error('Account is disabled');
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw new Error('Invalid credentials');
  }

  const payload: TokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organization_id,
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  const tokenHash = await bcrypt.hash(token, 10);
  await db.query(
    `
    INSERT INTO sessions (
      id,
      user_id,
      token_hash,
      expires_at,
      active,
      created_at
    )
    VALUES (
      gen_random_uuid(),
      $1,
      $2,
      NOW() + INTERVAL '7 days',
      true,
      NOW()
    )
  `,
    [user.id, tokenHash]
  );

  await db.query(
    `
    UPDATE users
    SET last_login_at = NOW()
    WHERE id = $1
  `,
    [user.id]
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organization_id: user.organization_id,
      avatar_url: user.avatar_url,
      phone: user.phone,
      display_name: user.display_name,
    },
  };
}

export async function verifyToken(token: string) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;

    const result = await db.query(
      `
      SELECT s.id, s.user_id, s.active, s.expires_at, s.token_hash, u.is_active, u.organization_id, u.role, u.email
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.user_id = $1
        AND s.active = true
        AND s.expires_at > NOW()
      LIMIT 1
    `,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Session expired or invalid');
    }

    const session = result.rows[0];

    const tokenMatches = await bcrypt.compare(token, session.token_hash);
    if (!tokenMatches) {
      throw new Error('Session expired or invalid');
    }

    if (!session.is_active) {
      throw new Error('Account is disabled');
    }

    return {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      organizationId:
        decoded.organizationId ||
        session.organization_id ||
        '00000000-0000-0000-0000-000000000001',
      sessionId: session.id,
      sessionExpiresAt: session.expires_at,
    };
  } catch (error) {
    throw new Error('Invalid token');
  }
}

export async function logout(token: string) {
  const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;

  await db.query(
    `
    UPDATE sessions
    SET active = false
    WHERE user_id = $1
  `,
    [decoded.userId]
  );
}
