import { createHmac, timingSafeEqual } from 'node:crypto';

export function getAdminCredentials(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_UI_USERNAME ?? 'admin',
    password: process.env.ADMIN_UI_PASSWORD ?? 'admin',
  };
}

export function verifyPassword(provided: string, expected: string): boolean {
  const a = createHmac('sha256', 'enigma-admin').update(provided).digest();
  const b = createHmac('sha256', 'enigma-admin').update(expected).digest();
  return timingSafeEqual(a, b);
}
