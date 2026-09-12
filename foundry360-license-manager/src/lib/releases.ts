/**
 * Enigma software release artifact storage (vendor-side).
 * Packages are generic — never include customer licenses, Deployment IDs, or signing keys.
 */

import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { artifactDir } from './signing';
import { prisma } from './prisma';
import type { DeploymentType, EnigmaReleaseArtifact, EnigmaRelease } from '@prisma/client';

const VERSION_RE = /^\d+\.\d+\.\d+([.-][A-Za-z0-9]+)*$/;

export function assertValidReleaseVersion(version: string): string {
  const v = version.trim();
  if (!VERSION_RE.test(v)) {
    throw new Error('version must look like 0.1.0 (optional prerelease suffix)');
  }
  return v;
}

export function releaseArtifactsRoot(version: string): string {
  const safe = version.replace(/[^A-Za-z0-9._-]/g, '_');
  return join(artifactDir(), 'releases', safe);
}

export function defaultPackageFileName(
  version: string,
  deploymentType: DeploymentType,
): string {
  const suffix = deploymentType === 'AIR_GAPPED' ? 'airgap' : 'vpc';
  return `enigma-${version}-${suffix}.tar.gz`;
}

export async function writeReleaseArtifactFile(opts: {
  version: string;
  fileName: string;
  data: Buffer | Uint8Array | ReadableStream<Uint8Array> | Readable;
}): Promise<{ path: string; sha256: string; sizeBytes: number }> {
  const dir = releaseArtifactsRoot(opts.version);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, opts.fileName);
  if (existsSync(path)) {
    unlinkSync(path);
  }

  if (Buffer.isBuffer(opts.data) || opts.data instanceof Uint8Array) {
    const buf = Buffer.isBuffer(opts.data) ? opts.data : Buffer.from(opts.data);
    writeFileSync(path, buf, { mode: 0o600 });
    return {
      path: resolve(path),
      sha256: createHash('sha256').update(buf).digest('hex'),
      sizeBytes: buf.length,
    };
  }

  const hash = createHash('sha256');
  let sizeBytes = 0;
  const hasher = new Transform({
    transform(chunk, _enc, cb) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(buf);
      sizeBytes += buf.length;
      cb(null, buf);
    },
  });

  const nodeReadable =
    opts.data instanceof Readable
      ? opts.data
      : Readable.fromWeb(opts.data as import('node:stream/web').ReadableStream);

  await pipeline(nodeReadable, hasher, createWriteStream(path, { mode: 0o600 }));
  return { path: resolve(path), sha256: hash.digest('hex'), sizeBytes };
}

export function serializeArtifact(a: EnigmaReleaseArtifact) {
  return {
    id: a.id,
    releaseId: a.releaseId,
    deploymentType: a.deploymentType,
    artifactType: a.artifactType,
    fileName: a.fileName,
    sha256: a.sha256,
    sizeBytes: Number(a.sizeBytes),
    createdAt: a.createdAt,
  };
}

export function serializeRelease(
  r: EnigmaRelease & { artifacts?: EnigmaReleaseArtifact[] },
) {
  return {
    id: r.id,
    version: r.version,
    releaseType: r.releaseType,
    status: r.status,
    releaseNotes: r.releaseNotes,
    publishedAt: r.publishedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    artifacts: (r.artifacts ?? []).map(serializeArtifact),
  };
}

/** Latest APPROVED production release with a package for the given deployment type. */
export async function resolveAvailablePackage(deploymentType: DeploymentType) {
  const release = await prisma.enigmaRelease.findFirst({
    where: {
      status: 'APPROVED',
      releaseType: 'PRODUCTION',
      artifacts: {
        some: {
          deploymentType,
          artifactType: 'DEPLOYMENT_PACKAGE',
        },
      },
    },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      artifacts: {
        where: {
          deploymentType,
          artifactType: 'DEPLOYMENT_PACKAGE',
        },
        take: 1,
      },
    },
  });

  if (!release || !release.artifacts[0]) return null;
  const artifact = release.artifacts[0];
  return {
    version: release.version,
    releaseId: release.id,
    status: release.status,
    artifact: serializeArtifact(artifact),
  };
}

export function assertDraftMutable(status: string) {
  if (status !== 'DRAFT') {
    throw new Error('Only DRAFT releases can be modified; create a new release instead');
  }
}

export function fileExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Remove release row, artifacts, and on-disk package files. Administrator-only via API. */
export async function deleteReleaseCompletely(id: string) {
  const release = await prisma.enigmaRelease.findUnique({
    where: { id },
    include: { artifacts: true },
  });
  if (!release) {
    throw new Error('Release not found');
  }

  for (const artifact of release.artifacts) {
    try {
      if (existsSync(artifact.filePath)) {
        unlinkSync(artifact.filePath);
      }
    } catch {
      // Continue deleting DB rows even if a file is already gone.
    }
  }

  const versionDir = releaseArtifactsRoot(release.version);

  await prisma.$transaction([
    prisma.enigmaReleaseArtifact.deleteMany({ where: { releaseId: id } }),
    prisma.enigmaRelease.delete({ where: { id } }),
  ]);

  try {
    if (existsSync(versionDir)) {
      rmSync(versionDir, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup of empty/partial version directory.
  }

  return { id: release.id, version: release.version };
}
