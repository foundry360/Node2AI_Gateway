import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres-client';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';
import { AuditService } from '@/services/audit.service';

const auditService = new AuditService();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const supabaseUserId = searchParams.get('supabase_user_id');
    const userId = searchParams.get('id');

    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Support filtering by supabase_user_id or id
    if (supabaseUserId) {
      conditions.push(`supabase_user_id = $${paramIndex}`);
      params.push(supabaseUserId);
      paramIndex++;
    }

    if (userId) {
      conditions.push(`id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (role && role !== 'all') {
      conditions.push(`role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    if (status && status !== 'all') {
      if (status === 'active') {
        conditions.push(`is_active = $${paramIndex}`);
        params.push(true);
      } else if (status === 'inactive') {
        conditions.push(`is_active = $${paramIndex}`);
        params.push(false);
      }
      paramIndex++;
    }

    if (search) {
      conditions.push(
        `(LOWER(name) LIKE $${paramIndex} OR LOWER(email) LIKE $${paramIndex + 1})`
      );
      params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
      paramIndex += 2;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total || '0');

    // Get paginated users
    // Check if avatar_url and phone columns exist (for backward compatibility)
    const offset = (page - 1) * limit;
    let usersResult;
    try {
      // Try with new columns first
      usersResult = await query(
        `SELECT 
          id, 
          name, 
          email, 
          role, 
          is_active, 
          last_login_at, 
          created_at,
          organization_id,
          supabase_user_id,
          avatar_url,
          phone,
          display_name
        FROM users 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );
    } catch (error: any) {
      // If columns don't exist, fall back to basic columns
      if (error.message && error.message.includes('avatar_url')) {
        console.log(
          '[Users API] avatar_url column not found, using fallback query'
        );
        usersResult = await query(
          `SELECT 
            id, 
            name, 
            email, 
            role, 
            is_active, 
            last_login_at, 
            created_at,
            organization_id,
            supabase_user_id
          FROM users 
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        );
        // Add null values for missing columns
        usersResult.rows = usersResult.rows.map((row: any) => ({
          ...row,
          avatar_url: null,
          phone: null,
          display_name: null,
        }));
      } else {
        throw error;
      }
    }

    const users = usersResult.rows;

    if (!users || users.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          users: [],
          pagination: { page: 1, limit, total: 0, totalPages: 0 },
        },
      });
    }

    // Fetch API key counts for each user
    const userIds = users.map((u: any) => u.id);
    let apiKeyCountsResult: any = { rows: [] };
    let usageCountsResult: any = { rows: [] };

    if (userIds.length > 0) {
      apiKeyCountsResult = await query(
        `SELECT created_by as user_id, COUNT(*) as count 
         FROM api_keys 
         WHERE created_by = ANY($1::uuid[]) 
         GROUP BY created_by`,
        [userIds]
      );

      // Fetch usage counts for each user
      usageCountsResult = await query(
        `SELECT user_id, COUNT(*) as count 
         FROM usage_events 
         WHERE user_id = ANY($1::uuid[]) 
         GROUP BY user_id`,
        [userIds]
      );
    }

    // Create lookup maps
    const apiKeyMap = new Map(
      apiKeyCountsResult.rows.map((r: any) => [
        r.user_id,
        parseInt(r.count || '0'),
      ])
    );
    const usageMap = new Map(
      usageCountsResult.rows.map((r: any) => [
        r.user_id,
        parseInt(r.count || '0'),
      ])
    );

    // Map users with counts
    const usersWithCounts = users.map((user: any) => {
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'viewer',
        status: user.is_active ? 'active' : 'inactive',
        last_login: user.last_login_at || null,
        created_at: user.created_at,
        organization_id: user.organization_id || null, // Include organization_id
        avatar_url: user.avatar_url || null,
        phone: user.phone || null,
        display_name: user.display_name || null,
        api_keys_count: apiKeyMap.get(user.id) || 0,
        total_requests: usageMap.get(user.id) || 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        users: usersWithCounts || [],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch users',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const body = await authRequest.json();
      const {
        name,
        email,
        role = 'viewer',
        status = 'active',
        organization_id,
      } = body;

      console.log('[Users API] POST request received:', {
        name,
        email,
        role,
        hasAuth: !!authRequest.auth,
      });

      if (!name || !email) {
        return NextResponse.json(
          { error: 'Name and email are required' },
          { status: 400 }
        );
      }

      // Validate role if provided
      if (role) {
        const validRoles = ['admin', 'developer', 'viewer', 'user'];
        if (!validRoles.includes(role)) {
          return NextResponse.json(
            { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
            { status: 400 }
          );
        }
      }

      // Get organization ID from authenticated user or use provided/default
      const orgId =
        organization_id ||
        authRequest.auth?.organizationId ||
        '00000000-0000-0000-0000-000000000001';
      const actorId = authRequest.auth?.userId;

      console.log('[Users API] Auth context:', {
        hasAuth: !!authRequest.auth,
        userId: authRequest.auth?.userId,
        email: authRequest.auth?.email,
        organizationId: authRequest.auth?.organizationId,
        role: authRequest.auth?.role,
        finalOrgId: orgId,
        finalActorId: actorId,
      });

      // Check if email already exists for this organization
      const existingUser = await query(
        `SELECT id FROM users WHERE email = $1 AND organization_id = $2`,
        [email, orgId]
      );

      if (existingUser.rows.length > 0) {
        return NextResponse.json(
          { error: 'User with this email already exists' },
          { status: 409 }
        );
      }

      // Insert user into database
      const startTime = Date.now();
      const result = await query(
        `INSERT INTO users (name, email, role, is_active, organization_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, role, is_active, created_at`,
        [name, email, role, status === 'active', orgId]
      );

      const newUser = result.rows[0];
      const durationMs = Date.now() - startTime;

      // Log audit event - user creation
      // Note: actorId might be undefined if Supabase token validation failed
      // In that case, we should still log but mark actor as unknown
      if (!actorId) {
        console.warn(
          '[Users API] ⚠️ No actorId found - authentication may have failed'
        );
        console.warn(
          '[Users API] Auth object:',
          JSON.stringify(authRequest.auth, null, 2)
        );
      }

      // Ensure we have a valid organizationId (required by database)
      if (!orgId || orgId === '00000000-0000-0000-0000-000000000000') {
        console.error('[Users API] ❌ Invalid organizationId:', orgId);
        return NextResponse.json(
          { error: 'Invalid organization' },
          { status: 400 }
        );
      }

      try {
        console.log('[Users API] 📝 Attempting to log audit event:', {
          actorId: actorId || 'NULL',
          actorEmail: authRequest.auth?.email || 'NULL',
          organizationId: orgId,
          resourceId: newUser.id,
          eventType: 'user_created',
        });

        // Get actor name from auth context or query it
        let actorName = authRequest.auth?.email
          ? authRequest.auth.email.split('@')[0]
          : undefined;
        if (actorId) {
          // Try to get the actor's name from the database
          try {
            const actorResult = await query(
              `SELECT name, email FROM users WHERE id = $1 LIMIT 1`,
              [actorId]
            );
            if (actorResult.rows.length > 0) {
              actorName = actorResult.rows[0].name || actorResult.rows[0].email;
            }
          } catch (err) {
            console.warn('[Users API] Could not fetch actor name:', err);
          }
        }

        const auditEntry = {
          eventType: 'user_created',
          eventCategory: 'configuration',
          actorId: actorId || undefined, // Allow undefined if auth failed
          actorType: 'user' as const,
          actorEmail: authRequest.auth?.email,
          actorName: actorName,
          action: 'create',
          resourceType: 'user',
          resourceId: newUser.id,
          organizationId: orgId, // Required - must not be null
          description: `User ${name} (${email}) created with role ${role}`,
          metadata: {
            name,
            email,
            role,
            status,
            createdBy: actorId || 'unknown',
            actorEmail: authRequest.auth?.email || 'unknown',
            actorName: actorName || 'unknown',
          },
          status: 'success' as const,
          securityLevel: (role === 'admin' ? 'high' : 'normal') as
            | 'high'
            | 'normal',
        };

        console.log(
          '[Users API] Audit entry:',
          JSON.stringify(auditEntry, null, 2)
        );

        const auditResult = await auditService.log(auditEntry);
        console.log(
          '[Users API] ✅ Audit event logged successfully, eventId:',
          auditResult
        );
      } catch (auditError: any) {
        console.error('[Users API] ❌ Failed to log audit event:', {
          error: auditError?.message,
          errorName: auditError?.name,
          stack: auditError?.stack?.substring(0, 500), // First 500 chars of stack
          actorId: actorId || 'undefined',
          organizationId: orgId,
        });
        // Don't fail the request if audit logging fails, but log the error
        console.error('[Users API] Full error:', auditError);
      }

      return NextResponse.json({
        success: true,
        data: {
          user: {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            status: newUser.is_active ? 'active' : 'inactive',
            created_at: newUser.created_at,
            api_keys_count: 0,
            total_requests: 0,
          },
        },
      });
    } catch (error) {
      console.error('Error creating user:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('Error details:', {
        message: errorMessage,
        stack: errorStack,
      });
      return NextResponse.json(
        {
          error: 'Failed to create user',
          details: errorMessage,
          stack:
            process.env.NODE_ENV === 'development' ? errorStack : undefined,
        },
        { status: 500 }
      );
    }
  });
}

export async function PATCH(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const body = await authRequest.json();
      let {
        id,
        name,
        email,
        role,
        status,
        organization_id,
        avatar_url,
        phone,
        display_name,
      } = body;

      // Get organization ID from auth context
      const orgId = authRequest.auth?.organizationId;
      const actorId = authRequest.auth?.userId;
      const actorEmail = authRequest.auth?.email;

      // If no ID provided but actor is authenticated, assume updating own profile
      if (!id && actorId) {
        console.log(
          '[Users API] No ID provided, using authenticated user ID:',
          actorId
        );
        id = actorId;
      }

      if (!id) {
        return NextResponse.json(
          { error: 'User ID is required' },
          { status: 400 }
        );
      }

      console.log('[Users API] PATCH request:', {
        id,
        orgId,
        actorId,
        updates: body,
      });

      // First, verify the user exists - try by id first, then by supabase_user_id, then by email
      console.log('[Users API] Looking up user with ID:', id);
      let userCheck = await query(
        `SELECT id, organization_id, supabase_user_id, email FROM users WHERE id = $1`,
        [id]
      );

      // If not found by id, try by supabase_user_id (in case frontend sent Supabase ID)
      if (userCheck.rows.length === 0) {
        console.log(
          '[Users API] User not found by id, trying supabase_user_id...'
        );
        userCheck = await query(
          `SELECT id, organization_id, supabase_user_id, email FROM users WHERE supabase_user_id = $1`,
          [id]
        );

        // If found by supabase_user_id, use the actual PostgreSQL id for the update
        if (userCheck.rows.length > 0) {
          const actualId = userCheck.rows[0].id;
          console.log(
            '[Users API] Found user by supabase_user_id, using PostgreSQL id:',
            actualId
          );
          id = actualId;
        }
      }

      // If still not found and we have an email (from body or auth context), try by email
      if (userCheck.rows.length === 0 && (email || actorEmail)) {
        const emailToUse = email || actorEmail;
        console.log(
          '[Users API] User not found by id or supabase_user_id, trying email...',
          emailToUse
        );
        userCheck = await query(
          `SELECT id, organization_id, supabase_user_id, email FROM users WHERE email = $1 AND organization_id = $2`,
          [emailToUse, orgId || '00000000-0000-0000-0000-000000000001']
        );

        if (userCheck.rows.length > 0) {
          const actualId = userCheck.rows[0].id;
          console.log(
            '[Users API] Found user by email, using PostgreSQL id:',
            actualId
          );
          id = actualId;
        }
      }

      // If still not found, try to use the authenticated user's ID as fallback
      if (userCheck.rows.length === 0 && actorId) {
        console.log(
          '[Users API] User not found, trying authenticated user ID as fallback...'
        );
        userCheck = await query(
          `SELECT id, organization_id, supabase_user_id, email FROM users WHERE id = $1`,
          [actorId]
        );

        if (userCheck.rows.length > 0) {
          const actualId = userCheck.rows[0].id;
          console.log(
            '[Users API] Found user by authenticated user ID, using:',
            actualId
          );
          id = actualId;
        }
      }

      if (userCheck.rows.length === 0) {
        console.error('[Users API] User not found with any method:', {
          providedId: id,
          email: email,
          actorId: actorId,
          orgId: orgId,
        });
        return NextResponse.json(
          {
            error: 'User not found',
            details:
              'Could not locate user by ID, supabase_user_id, email, or authenticated user ID',
          },
          { status: 404 }
        );
      }

      const existingUser = userCheck.rows[0];
      console.log('[Users API] Found user:', {
        id: existingUser.id,
        organization_id: existingUser.organization_id,
        supabase_user_id: existingUser.supabase_user_id,
      });

      // Build update clause
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        params.push(name);
        paramIndex++;
      }

      if (email !== undefined) {
        updates.push(`email = $${paramIndex}`);
        params.push(email);
        paramIndex++;
      }

      if (role !== undefined) {
        // Validate role
        const validRoles = ['admin', 'developer', 'viewer', 'user'];
        if (!validRoles.includes(role)) {
          return NextResponse.json(
            { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
            { status: 400 }
          );
        }
        updates.push(`role = $${paramIndex}`);
        params.push(role);
        paramIndex++;
      }

      if (status !== undefined) {
        updates.push(`is_active = $${paramIndex}`);
        params.push(status === 'active');
        paramIndex++;
      }

      if (organization_id !== undefined) {
        updates.push(`organization_id = $${paramIndex}`);
        params.push(organization_id);
        paramIndex++;
      }

      if (avatar_url !== undefined) {
        updates.push(`avatar_url = $${paramIndex}`);
        params.push(avatar_url);
        paramIndex++;
      }

      if (phone !== undefined) {
        updates.push(`phone = $${paramIndex}`);
        params.push(phone);
        paramIndex++;
      }

      if (display_name !== undefined) {
        updates.push(`display_name = $${paramIndex}`);
        params.push(display_name);
        paramIndex++;
      }

      if (updates.length === 0) {
        return NextResponse.json(
          { error: 'No fields to update' },
          { status: 400 }
        );
      }

      // Add updated_at
      updates.push(`updated_at = NOW()`);

      // Add id as last parameter
      params.push(id);

      let result;
      try {
        // Try with new columns first
        // Use the actual PostgreSQL id we found (or the one sent if it matched)
        const finalParams = [...params.slice(0, -1), id]; // Replace last param (id) with the correct id
        result = await query(
          `UPDATE users 
         SET ${updates.join(', ')} 
         WHERE id = $${paramIndex}
         RETURNING id, name, email, role, is_active, organization_id, created_at, updated_at, last_login_at, supabase_user_id, avatar_url, phone, display_name`,
          finalParams
        );
      } catch (error: any) {
        // If columns don't exist, use basic columns
        if (
          error.message &&
          (error.message.includes('avatar_url') ||
            error.message.includes('phone') ||
            error.message.includes('display_name'))
        ) {
          // Remove new columns from updates if they don't exist
          const basicUpdates = updates.filter(
            u =>
              !u.includes('avatar_url') &&
              !u.includes('phone') &&
              !u.includes('display_name')
          );
          const basicParams = params.slice(0, -1); // Remove id from params

          if (basicUpdates.length > 0) {
            // Recalculate param indices for basic query
            let basicParamIndex = 1;
            const correctedUpdates = basicUpdates.map((update: string) => {
              const match = update.match(/=\s*\$\d+/);
              if (match) {
                const newUpdate = update.replace(
                  /\$\d+/,
                  `$${basicParamIndex}`
                );
                basicParamIndex++;
                return newUpdate;
              }
              return update;
            });

            const basicFinalParams = [...basicParams, id]; // Use the correct id
            result = await query(
              `UPDATE users 
             SET ${correctedUpdates.join(', ')} 
             WHERE id = $${basicParamIndex}
             RETURNING id, name, email, role, is_active, organization_id, created_at, updated_at, last_login_at, supabase_user_id`,
              basicFinalParams
            );
          } else {
            // If all updates were for missing columns, just fetch the user
            result = await query(
              `SELECT id, name, email, role, is_active, organization_id, created_at, updated_at, last_login_at, supabase_user_id
             FROM users WHERE id = $1`,
              [id]
            );
          }

          // Add null values for missing columns if we're trying to update them
          result.rows = result.rows.map((row: any) => ({
            ...row,
            avatar_url: updates.some(u => u.includes('avatar_url'))
              ? body.avatar_url || null
              : null,
            phone: updates.some(u => u.includes('phone'))
              ? body.phone || null
              : null,
            display_name: updates.some(u => u.includes('display_name'))
              ? body.display_name || null
              : null,
          }));
        } else {
          throw error;
        }
      }

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const updatedUser = result.rows[0];
      // Use existing orgId or fallback to updated user's organization_id
      const finalOrgId = orgId || updatedUser.organization_id;

      // Get API key count and usage count
      const [apiKeyCount, usageCount] = await Promise.all([
        query(`SELECT COUNT(*) as count FROM api_keys WHERE created_by = $1`, [
          id,
        ]),
        query(`SELECT COUNT(*) as count FROM usage_events WHERE user_id = $1`, [
          id,
        ]),
      ]);

      // Get actor's display name for audit logging
      let actorName: string | undefined;
      if (actorId) {
        try {
          console.log('[Users API] Fetching actor for audit log:', {
            actorId,
            actorEmail: authRequest.auth?.email,
          });
          const actorResult = await query(
            `SELECT display_name, name, email FROM users WHERE id = $1`,
            [actorId]
          );
          if (actorResult.rows.length > 0) {
            const actorData = actorResult.rows[0];
            actorName =
              actorData.display_name ||
              actorData.name ||
              actorData.email?.split('@')[0];
            console.log('[Users API] Actor found:', {
              actorName,
              actorEmail: actorData.email,
            });
          } else {
            console.error('[Users API] No actor found for id:', actorId);
          }
        } catch (error) {
          console.error('[Users API] Error fetching actor name:', error);
        }
      } else {
        console.error('[Users API] No actorId provided from auth context!');
      }

      // Log audit event - user update
      try {
        const changes: Record<string, any> = {};
        if (name !== undefined) changes.name = name;
        if (email !== undefined) changes.email = email;
        if (role !== undefined) changes.role = role;
        if (status !== undefined) changes.status = status;
        if (organization_id !== undefined)
          changes.organization_id = organization_id;
        if (display_name !== undefined) changes.display_name = display_name;
        if (phone !== undefined) changes.phone = phone;
        if (avatar_url !== undefined)
          changes.avatar_url = avatar_url ? '[UPDATED]' : null; // Don't log full URLs

        await auditService.log({
          eventType: 'user_updated',
          eventCategory: 'configuration',
          actorId: actorId,
          actorType: 'user',
          actorEmail: authRequest.auth?.email,
          actorName: actorName || authRequest.auth?.email?.split('@')[0], // Use actor's display name or email prefix
          action: 'update',
          resourceType: 'user',
          resourceId: id,
          organizationId: finalOrgId,
          description: `User ${updatedUser.email} updated`,
          metadata: changes,
          status: 'success',
          securityLevel:
            role === 'admin' || updatedUser.role === 'admin'
              ? 'high'
              : 'normal',
        });
      } catch (auditError) {
        console.error('[Users API] Failed to log audit event:', auditError);
        // Don't fail the request if audit logging fails
      }

      return NextResponse.json({
        success: true,
        data: {
          user: {
            id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            status: updatedUser.is_active ? 'active' : 'inactive',
            organization_id: updatedUser.organization_id,
            created_at: updatedUser.created_at,
            updated_at: updatedUser.updated_at,
            last_login: updatedUser.last_login_at,
            avatar_url: updatedUser.avatar_url || null,
            phone: updatedUser.phone || null,
            display_name: updatedUser.display_name || null,
            api_keys_count: parseInt(apiKeyCount.rows[0]?.count || '0'),
            total_requests: parseInt(usageCount.rows[0]?.count || '0'),
          },
        },
      });
    } catch (error) {
      console.error('Error updating user:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        {
          error: 'Failed to update user',
          details: errorMessage,
        },
        { status: 500 }
      );
    }
  });
}

export async function DELETE(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');

      if (!id) {
        return NextResponse.json(
          { error: 'User ID is required' },
          { status: 400 }
        );
      }

      // Check if user exists
      const userCheck = await query(
        `SELECT id, email, organization_id FROM users WHERE id = $1`,
        [id]
      );

      if (userCheck.rows.length === 0) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const userToDelete = userCheck.rows[0];
      const actorId = authRequest.auth?.userId;
      const orgId =
        authRequest.auth?.organizationId || userToDelete.organization_id;

      // Delete user (cascade will handle related records if foreign keys are set up)
      await query(`DELETE FROM users WHERE id = $1`, [id]);

      // Log audit event - user deletion
      try {
        await auditService.log({
          eventType: 'user_deleted',
          eventCategory: 'configuration',
          actorId: actorId,
          actorType: 'user',
          actorEmail: authRequest.auth?.email,
          action: 'delete',
          resourceType: 'user',
          resourceId: id,
          organizationId: orgId,
          description: `User ${userToDelete.email} deleted`,
          metadata: {
            deleted_user: {
              id: userToDelete.id,
              email: userToDelete.email,
            },
          },
          status: 'success',
          securityLevel: 'high', // User deletion is always high security
        });
      } catch (auditError) {
        console.error('[Users API] Failed to log audit event:', auditError);
        // Don't fail the request if audit logging fails
      }

      return NextResponse.json({
        success: true,
        message: 'User deleted successfully',
        data: {
          deleted_user: {
            id: userToDelete.id,
            email: userToDelete.email,
          },
        },
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Check for foreign key constraint violations
      if (
        errorMessage.includes('foreign key') ||
        errorMessage.includes('constraint')
      ) {
        return NextResponse.json(
          {
            error:
              'Cannot delete user. User has associated records (API keys, usage events, etc.). Please remove these first.',
            details: errorMessage,
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          error: 'Failed to delete user',
          details: errorMessage,
        },
        { status: 500 }
      );
    }
  });
}
