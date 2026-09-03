/**
 * User Service - Handles finding or creating end-users for usage tracking
 *
 * When a customer's front-end app makes an API call with an API key,
 * they can pass X-User-ID or X-User-Email to identify the end-user.
 * This service finds or creates that user in the database for usage tracking.
 */

import { query } from '../db/postgres-client';
import { v4 as uuidv4 } from 'uuid';

export interface FindOrCreateUserResult {
  userId: string;
  created: boolean;
}

/**
 * Find or create an end-user based on email or external user ID
 * Used when customer front-end apps pass user identifiers via headers
 */
export async function findOrCreateEndUser(
  organizationId: string,
  email?: string,
  externalUserId?: string,
  name?: string
): Promise<FindOrCreateUserResult> {
  try {
    // Try to find existing user by email (most reliable)
    if (email) {
      const existingUser = await query(
        `SELECT id FROM users 
         WHERE organization_id = $1 AND email = $2 AND is_active = true
         LIMIT 1`,
        [organizationId, email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        return {
          userId: existingUser.rows[0].id,
          created: false,
        };
      }
    }

    // Create new user if not found
    const newUserId = uuidv4();
    const userEmail =
      email || `user_${externalUserId || newUserId}@enduser.local`;
    const userName =
      name ||
      email?.split('@')[0] ||
      `User ${externalUserId || newUserId.substring(0, 8)}`;

    const result = await query(
      `INSERT INTO users (
        id,
        organization_id,
        email,
        name,
        role,
        is_active,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (organization_id, email) 
      DO UPDATE SET updated_at = NOW()
      RETURNING id`,
      [
        newUserId,
        organizationId,
        userEmail.toLowerCase(),
        userName,
        'user',
        true,
      ]
    );

    const finalUserId = result.rows[0]?.id || newUserId;
    console.log(`✅ Created/updated end-user: ${userEmail} (${finalUserId})`);

    return {
      userId: finalUserId,
      created: true,
    };
  } catch (error) {
    console.error('[UserService] Error finding/creating end user:', error);
    throw error;
  }
}
