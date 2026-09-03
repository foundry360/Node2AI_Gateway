import { register } from '@/lib/auth/native-auth';

export async function POST(request: Request) {
  try {
    const { email, password, name, organizationId } = await request.json();

    if (!email || !password || !name || !organizationId) {
      return Response.json(
        {
          success: false,
          error: 'Email, password, name, and organizationId are required',
        },
        { status: 400 }
      );
    }

    const user = await register(email, password, name, organizationId);

    return Response.json(
      {
        success: true,
        user,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return Response.json(
      {
        success: false,
        error: error.message || 'Registration failed',
      },
      { status: 400 }
    );
  }
}
