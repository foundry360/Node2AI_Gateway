import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  AVATAR_MAX_BYTES,
  deleteAvatar,
  extensionForMime,
  readAvatar,
  saveAvatar,
} from '@/lib/avatar-store';
import { readSessionToken, SESSION_COOKIE } from '@/lib/auth-session';

async function requireSession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return readSessionToken(token);
}

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ status: 'error', message: 'Unauthenticated' }, { status: 401 });
  }

  const avatar = await readAvatar(session.sub);
  if (!avatar) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(avatar.buffer), {
    status: 200,
    headers: {
      'Content-Type': avatar.mime,
      'Cache-Control': 'private, max-age=60',
    },
  });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ status: 'error', message: 'Unauthenticated' }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('avatar');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { status: 'error', message: 'avatar file required' },
      { status: 400 },
    );
  }

  if (!extensionForMime(file.type)) {
    return NextResponse.json(
      { status: 'error', message: 'Use a JPEG, PNG, or WebP image' },
      { status: 400 },
    );
  }

  if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json(
      { status: 'error', message: 'Image must be 5 MB or smaller' },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await saveAvatar(session.sub, buffer, file.type);
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to save avatar',
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ status: 'ok' });
}

export async function DELETE() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ status: 'error', message: 'Unauthenticated' }, { status: 401 });
  }

  await deleteAvatar(session.sub);
  return NextResponse.json({ status: 'ok' });
}
