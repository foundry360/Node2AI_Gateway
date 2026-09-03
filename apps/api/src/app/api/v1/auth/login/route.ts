import { login } from '@/lib/auth/native-auth';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return Response.json(
        {
          success: false,
          error: 'Email and password are required',
        },
        { status: 400 }
      );
    }

    const result = await login(email, password);

    return Response.json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (error: any) {
    return Response.json(
      {
        success: false,
        error: error.message || 'Invalid credentials',
      },
      { status: 401 }
    );
  }
}
