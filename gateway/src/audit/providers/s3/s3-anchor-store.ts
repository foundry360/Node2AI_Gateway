import {
  canonicalAnchorJson,
  defaultObjectPath,
  hashAnchorPayload,
  type EvidenceAnchorPayload,
  type EvidenceAnchorStore,
  type PutAnchorResult,
} from '../../anchor.js';
import { AwsSdkS3ObjectClient } from './aws-sdk-s3-client.js';
import type { S3ObjectClient } from './s3-object-client.js';

export type S3EvidenceAnchorStoreOptions = {
  bucket: string;
  region: string;
  /** Optional key prefix (no leading/trailing slash required). */
  prefix?: string;
  client: S3ObjectClient;
  /**
   * When true, document/assert customer Object Lock expectation.
   * The adapter never deletes or overwrites; platform retention is customer-owned.
   */
  requireObjectLock?: boolean;
};

/**
 * Customer-controlled S3 evidence store (Object Lock recommended in production).
 * No delete/update APIs. Conflicts never overwrite.
 */
export class S3EvidenceAnchorStore implements EvidenceAnchorStore {
  readonly provider = 'S3_OBJECT_LOCK' as const;
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly client: S3ObjectClient;

  constructor(opts: S3EvidenceAnchorStoreOptions) {
    if (!opts.bucket?.trim()) {
      throw new Error('S3 evidence bucket is required');
    }
    this.bucket = opts.bucket.trim();
    this.prefix = (opts.prefix ?? '').replace(/^\/+|\/+$/g, '');
    this.client = opts.client;
  }

  objectPath(deploymentId: string, sequenceEnd: number, checkpointId: string): string {
    const base = defaultObjectPath(deploymentId, sequenceEnd, checkpointId);
    return this.prefix ? `${this.prefix}/${base}` : base;
  }

  uriForKey(key: string): string {
    return `s3://${this.bucket}/${key}`;
  }

  private keyFromUri(uri: string): string | null {
    const prefix = `s3://${this.bucket}/`;
    if (uri.startsWith(prefix)) return uri.slice(prefix.length);
    if (!uri.includes('://')) return uri;
    return null;
  }

  async exists(path: string): Promise<boolean> {
    return this.client.headObject(this.bucket, path);
  }

  async putAnchor(
    path: string,
    payload: EvidenceAnchorPayload,
  ): Promise<PutAnchorResult> {
    const body = canonicalAnchorJson(payload);
    const hash = hashAnchorPayload(payload);
    const uri = this.uriForKey(path);

    try {
      const existing = await this.client.getObject(this.bucket, path);
      if (existing) {
        if (existing.body === body) {
          return { ok: true, uri, hash };
        }
        return {
          ok: false,
          code: 'ANCHOR_CONFLICT',
          message: 'Object already exists with different content',
        };
      }

      try {
        await this.client.putObject({
          bucket: this.bucket,
          key: path,
          body,
          contentType: 'application/json',
        });
      } catch (err) {
        const raced = await this.client.getObject(this.bucket, path);
        if (raced) {
          if (raced.body === body) return { ok: true, uri, hash };
          return {
            ok: false,
            code: 'ANCHOR_CONFLICT',
            message: 'Object already exists with different content',
          };
        }
        return {
          ok: false,
          code: 'STORE_UNAVAILABLE',
          message: err instanceof Error ? err.message : 'S3 put failed',
        };
      }

      return { ok: true, uri, hash };
    } catch (err) {
      return {
        ok: false,
        code: 'STORE_UNAVAILABLE',
        message: err instanceof Error ? err.message : 'S3 unavailable',
      };
    }
  }

  async getAnchor(
    uri: string,
  ): Promise<{ payload: EvidenceAnchorPayload; hash: string } | null> {
    const key = this.keyFromUri(uri);
    if (!key) return null;
    try {
      const got = await this.client.getObject(this.bucket, key);
      if (!got) return null;
      const payload = JSON.parse(got.body) as EvidenceAnchorPayload;
      return { payload, hash: hashAnchorPayload(payload) };
    } catch {
      return null;
    }
  }
}

export function createS3EvidenceAnchorStore(opts: {
  bucket: string;
  region: string;
  prefix?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  client?: S3ObjectClient;
}): S3EvidenceAnchorStore {
  const client =
    opts.client ??
    new AwsSdkS3ObjectClient({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: opts.forcePathStyle,
    });
  return new S3EvidenceAnchorStore({
    bucket: opts.bucket,
    region: opts.region,
    prefix: opts.prefix,
    client,
    requireObjectLock: true,
  });
}
