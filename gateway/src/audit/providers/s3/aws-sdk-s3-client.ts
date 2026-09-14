import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import type {
  S3ObjectClient,
  S3ObjectGetResult,
  S3ObjectPutInput,
} from './s3-object-client.js';

/**
 * AWS SDK-backed S3 client. Isolated from core audit packages.
 * Credentials come from the default AWS chain (env, shared config, IAM role).
 */
export class AwsSdkS3ObjectClient implements S3ObjectClient {
  private readonly client: S3Client;

  constructor(opts: { region: string; endpoint?: string; forcePathStyle?: boolean }) {
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: opts.forcePathStyle,
    });
  }

  async putObject(input: S3ObjectPutInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        // Refuse overwrite when the bucket supports conditional writes /
        // Object Lock. If the API rejects, caller maps to conflict/unavailable.
        IfNoneMatch: '*',
      }),
    );
  }

  async getObject(bucket: string, key: string): Promise<S3ObjectGetResult | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const body = res.Body ? await res.Body.transformToString() : '';
      return { body, etag: res.ETag };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async headObject(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === 'NotFound' ||
    e?.name === 'NoSuchKey' ||
    e?.$metadata?.httpStatusCode === 404
  );
}
