import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD || 'changeme-admin';

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { role: UserRole.ADMINISTRATOR },
    create: {
      username: 'admin',
      passwordHash: await bcrypt.hash(password, 12),
      role: UserRole.ADMINISTRATOR,
    },
  });

  await prisma.user.upsert({
    where: { username: 'viewer' },
    update: { role: UserRole.VIEWER },
    create: {
      username: 'viewer',
      passwordHash: await bcrypt.hash(
        process.env.SEED_VIEWER_PASSWORD || 'changeme-viewer',
        12,
      ),
      role: UserRole.VIEWER,
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
