import { verifyToken } from '@/lib/auth/native-auth';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json(
        {
          success: false,
          error: 'Authorization header missing or invalid',
        },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decoded = await verifyToken(token);

    const userResult = await db.query(
      `
      SELECT 
        id, 
        email, 
        name, 
        role, 
        organization_id, 
        is_active, 
        created_at, 
        updated_at, 
        last_login_at,
        avatar_url,
        phone,
        display_name
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return Response.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const user = userResult.rows[0];

    return Response.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organization_id: user.organization_id,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login_at: user.last_login_at,
        avatar_url: user.avatar_url,
        phone: user.phone,
        display_name: user.display_name,
      },
    });
  } catch (error: any) {
    return Response.json(
      {
        success: false,
        error: error.message || 'Failed to retrieve user information',
      },
      { status: 401 }
    );
  }
}
