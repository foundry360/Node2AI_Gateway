/**
 * Minimal S3 object surface used by the evidence anchor adapter.
 * Keeps AWS SDK types out of the core EvidenceAnchorStore interface.
 */
export type S3ObjectPutInput = {
  bucket: string;
  key: string;
  body: string;
  contentType: string;
};

export type S3ObjectGetResult = {
  body: string;
  etag?: string;
};

export interface S3ObjectClient {
  putObject(input: S3ObjectPutInput): Promise<void>;
  getObject(bucket: string, key: string): Promise<S3ObjectGetResult | null>;
  headObject(bucket: string, key: string): Promise<boolean>;
}

/** In-memory fake for unit tests (no AWS). */
export class InMemoryS3ObjectClient implements S3ObjectClient {
  readonly objects = new Map<string, string>();

  private id(bucket: string, key: string): string {
    return `${bucket}::${key}`;
  }

  async putObject(input: S3ObjectPutInput): Promise<void> {
    const id = this.id(input.bucket, input.key);
    if (this.objects.has(id)) {
      const err = new Error('ObjectAlreadyExists');
      (err as Error & { name: string }).name = 'PreconditionFailed';
      throw err;
    }
    this.objects.set(id, input.body);
  }

  async getObject(bucket: string, key: string): Promise<S3ObjectGetResult | null> {
    const body = this.objects.get(this.id(bucket, key));
    if (body === undefined) return null;
    return { body };
  }

  async headObject(bucket: string, key: string): Promise<boolean> {
    return this.objects.has(this.id(bucket, key));
  }
}
