import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  canonicalAnchorJson,
  defaultObjectPath,
  hashAnchorPayload,
  type EvidenceAnchorPayload,
  type EvidenceAnchorStore,
  type PutAnchorResult,
} from './anchor.js';

/**
 * Local / air-gap evidence store.
 * Writes are atomic (temp + rename). Never overwrites an existing object.
 */
export class FilesystemEvidenceAnchorStore implements EvidenceAnchorStore {
  readonly provider = 'FILESYSTEM' as const;

  constructor(private readonly rootDir: string) {
    mkdirSync(this.rootDir, { recursive: true });
  }

  objectPath(deploymentId: string, sequenceEnd: number, checkpointId: string): string {
    return defaultObjectPath(deploymentId, sequenceEnd, checkpointId);
  }

  private abs(path: string): string {
    const full = resolve(this.rootDir, path);
    if (!full.startsWith(resolve(this.rootDir))) {
      throw new Error('Invalid anchor path');
    }
    return full;
  }

  async exists(path: string): Promise<boolean> {
    return existsSync(this.abs(path));
  }

  async putAnchor(
    path: string,
    payload: EvidenceAnchorPayload,
  ): Promise<PutAnchorResult> {
    try {
      const full = this.abs(path);
      const body = canonicalAnchorJson(payload);
      const hash = hashAnchorPayload(payload);

      if (existsSync(full)) {
        const existing = readFileSync(full, 'utf8');
        if (existing === body) {
          return { ok: true, uri: `file://${full}`, hash };
        }
        return {
          ok: false,
          code: 'ANCHOR_CONFLICT',
          message: 'Object already exists with different content',
        };
      }

      mkdirSync(dirname(full), { recursive: true });
      const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(tmp, body, { encoding: 'utf8', mode: 0o600 });
      try {
        renameSync(tmp, full);
      } catch (err) {
        // Race: another writer created the file
        if (existsSync(full)) {
          try {
            const existing = readFileSync(full, 'utf8');
            if (existing === body) {
              return { ok: true, uri: `file://${full}`, hash };
            }
          } catch {
            /* fall through */
          }
          return {
            ok: false,
            code: 'ANCHOR_CONFLICT',
            message: 'Object already exists with different content',
          };
        }
        throw err;
      }
      return { ok: true, uri: `file://${full}`, hash };
    } catch (err) {
      return {
        ok: false,
        code: 'STORE_UNAVAILABLE',
        message: err instanceof Error ? err.message : 'Store unavailable',
      };
    }
  }

  async getAnchor(
    uri: string,
  ): Promise<{ payload: EvidenceAnchorPayload; hash: string } | null> {
    let full: string;
    if (uri.startsWith('file://')) {
      full = uri.slice('file://'.length);
    } else if (uri.startsWith('/')) {
      full = uri;
    } else {
      full = this.abs(uri);
    }
    if (!existsSync(full)) return null;
    const raw = readFileSync(full, 'utf8');
    const payload = JSON.parse(raw) as EvidenceAnchorPayload;
    return { payload, hash: hashAnchorPayload(payload) };
  }
}

/** In-memory store for unit tests. */
export class InMemoryEvidenceAnchorStore implements EvidenceAnchorStore {
  readonly provider = 'FILESYSTEM' as const;
  private readonly objects = new Map<string, string>();

  objectPath(deploymentId: string, sequenceEnd: number, checkpointId: string): string {
    return defaultObjectPath(deploymentId, sequenceEnd, checkpointId);
  }

  async exists(path: string): Promise<boolean> {
    return this.objects.has(path);
  }

  async putAnchor(
    path: string,
    payload: EvidenceAnchorPayload,
  ): Promise<PutAnchorResult> {
    const body = canonicalAnchorJson(payload);
    const hash = hashAnchorPayload(payload);
    const existing = this.objects.get(path);
    if (existing !== undefined) {
      if (existing === body) return { ok: true, uri: `mem://${path}`, hash };
      return {
        ok: false,
        code: 'ANCHOR_CONFLICT',
        message: 'Object already exists with different content',
      };
    }
    this.objects.set(path, body);
    return { ok: true, uri: `mem://${path}`, hash };
  }

  async getAnchor(
    uri: string,
  ): Promise<{ payload: EvidenceAnchorPayload; hash: string } | null> {
    const path = uri.startsWith('mem://') ? uri.slice('mem://'.length) : uri;
    const raw = this.objects.get(path);
    if (!raw) return null;
    const payload = JSON.parse(raw) as EvidenceAnchorPayload;
    return { payload, hash: hashAnchorPayload(payload) };
  }
}

export function joinAnchorRoot(...parts: string[]): string {
  return join(...parts);
}
