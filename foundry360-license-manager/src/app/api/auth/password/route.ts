import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AuthError, requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk } from '@/lib/http';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
  confirmPassword: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());
    if (body.newPassword !== body.confirmPassword) {
      throw new AuthError(400, 'PASSWORD_MISMATCH', 'New password confirmation does not match');
    }
    if (body.newPassword === body.currentPassword) {
      throw new AuthError(400, 'PASSWORD_UNCHANGED', 'New password must differ from the current password');
    }

    const user = await prisma.user.findUnique({ where: { id: session.id } });
    if (!user) {
      throw new AuthError(401, 'UNAUTHENTICATED', 'Authentication required');
    }

    const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!ok) {
      throw new AuthError(400, 'INVALID_PASSWORD', 'Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return jsonOk({ ok: true, message: 'Password updated' });
  } catch (err) {
    return jsonError(err);
  }
}
