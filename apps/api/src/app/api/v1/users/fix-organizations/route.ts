import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres-client';

/**
 * POST /api/v1/users/fix-organizations
 * Fixes users with all-zero or NULL organization_id
 * Sets them to the default organization ID
 */
export async function POST(request: NextRequest) {
  try {
    const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

    console.log('[Fix Organizations] Starting user organization_id fix...');

    // First, check if default organization exists, create if not
    const orgCheck = await query(`SELECT id FROM organizations WHERE id = $1`, [
      DEFAULT_ORG_ID,
    ]);

    if (orgCheck.rows.length === 0) {
      console.log('[Fix Organizations] Creating default organization...');
      await query(
        `INSERT INTO organizations (id, name, deployment_mode, license_tier, max_instances, created_at, updated_at)
         VALUES ($1, 'Default Organization', 'self-hosted', 'enterprise', 1, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [DEFAULT_ORG_ID]
      );
    }

    // Find users with all-zero or NULL organization_id
    const usersToFix = await query(
      `SELECT id, email, name, organization_id 
       FROM users 
       WHERE organization_id = $1 OR organization_id IS NULL`,
      [ZERO_UUID]
    );

    console.log(
      `[Fix Organizations] Found ${usersToFix.rows.length} users to fix`
    );

    if (usersToFix.rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users need to be fixed.',
        fixed: 0,
      });
    }

    // Update all users with the default organization ID
    const updateResult = await query(
      `UPDATE users 
       SET organization_id = $1, updated_at = NOW()
       WHERE organization_id = $2 OR organization_id IS NULL
       RETURNING id, email, name`,
      [DEFAULT_ORG_ID, ZERO_UUID]
    );

    console.log(
      `[Fix Organizations] Updated ${updateResult.rows.length} users`
    );

    return NextResponse.json({
      success: true,
      message: `Updated ${updateResult.rows.length} user(s) to use default organization`,
      fixed: updateResult.rows.length,
      users: updateResult.rows.map((user: any) => ({
        id: user.id,
        email: user.email,
        name: user.name,
      })),
    });
  } catch (error: any) {
    console.error('[Fix Organizations] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fix user organization IDs',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
