import { createHash } from 'crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'fs/promises';
import path from 'path';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function avatarDataDir(): string {
  return process.env.ADMIN_DATA_DIR
    ? path.resolve(process.env.ADMIN_DATA_DIR, 'avatars')
    : path.join(process.cwd(), 'data', 'avatars');
}

function safeUserKey(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 32);
}

function avatarStem(userId: string): string {
  return safeUserKey(userId);
}

export function extensionForMime(mime: string): string | null {
  return ALLOWED_TYPES[mime] ?? null;
}

export function mimeForExtension(ext: string): string | null {
  const entry = Object.entries(ALLOWED_TYPES).find(([, value]) => value === ext);
  return entry?.[0] ?? null;
}

async function ensureDir(): Promise<string> {
  const dir = avatarDataDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function findAvatarPath(userId: string): Promise<string | null> {
  const dir = await ensureDir();
  const stem = avatarStem(userId);
  const files = await readdir(dir).catch(() => [] as string[]);
  const match = files.find((name) => name.startsWith(`${stem}.`));
  return match ? path.join(dir, match) : null;
}

export async function readAvatar(
  userId: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  const filePath = await findAvatarPath(userId);
  if (!filePath) return null;
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = mimeForExtension(ext);
  if (!mime) return null;
  const buffer = await readFile(filePath);
  return { buffer, mime };
}

export async function saveAvatar(
  userId: string,
  buffer: Buffer,
  mime: string,
): Promise<{ mime: string }> {
  const ext = extensionForMime(mime);
  if (!ext) {
    throw new Error('Unsupported image type');
  }
  if (buffer.byteLength === 0 || buffer.byteLength > AVATAR_MAX_BYTES) {
    throw new Error('Image must be between 1 byte and 5 MB');
  }

  const dir = await ensureDir();
  const stem = avatarStem(userId);

  // Remove any prior extension for this user.
  const files = await readdir(dir).catch(() => [] as string[]);
  await Promise.all(
    files
      .filter((name) => name.startsWith(`${stem}.`))
      .map((name) => unlink(path.join(dir, name)).catch(() => undefined)),
  );

  await writeFile(path.join(dir, `${stem}.${ext}`), buffer);
  return { mime };
}

export async function deleteAvatar(userId: string): Promise<boolean> {
  const filePath = await findAvatarPath(userId);
  if (!filePath) return false;
  await unlink(filePath);
  return true;
}
