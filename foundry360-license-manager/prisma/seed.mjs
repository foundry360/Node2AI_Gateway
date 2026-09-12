import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'changeme-admin';
  const viewerPassword = process.env.SEED_VIEWER_PASSWORD || 'changeme-viewer';

  // Only set password on create — never overwrite passwords on restart
  // after operators change them in the portal.
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { role: 'ADMINISTRATOR' },
    create: {
      username: 'admin',
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: 'ADMINISTRATOR',
    },
  });

  await prisma.user.upsert({
    where: { username: 'viewer' },
    update: { role: 'VIEWER' },
    create: {
      username: 'viewer',
      passwordHash: await bcrypt.hash(viewerPassword, 12),
      role: 'VIEWER',
    },
  });

  console.log('Seeded users: admin (ADMINISTRATOR), viewer (VIEWER)');
  console.log('Existing user passwords are left unchanged on re-seed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
