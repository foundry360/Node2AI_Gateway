import { logout, verifyToken } from '@/lib/auth/native-auth';

export async function POST(request: Request) {
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

    await logout(token);

    return Response.json({
      success: true,
      message: 'Logged out successfully',
      logoutTime: new Date().toISOString(),
      user: {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      },
    });
  } catch (error: any) {
    return Response.json(
      {
        success: false,
        error: error.message || 'Logout failed',
      },
      { status: 401 }
    );
  }
}
