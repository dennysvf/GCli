import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "@/shared/config/env";

// Private S3-compatible storage (architecture 5.6, ADR-009): MinIO locally, R2 in production.
// Object keys never contain personal data: org/{orgId}/{module}/{uuid}.
export type StoredObject = { body: Uint8Array; contentType: string | undefined };

export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  // Metadata of a stored object, or null when it does not exist (confirms uploads).
  head(key: string): Promise<{ size: number; contentType: string | undefined } | null>;
  ping(): Promise<void>;
  presignGet(key: string, expiresInSeconds?: number): Promise<string>;
  presignPut(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
}

export function objectKey(organizationId: string, module: string, fileName: string): string {
  return `org/${organizationId}/${module}/${fileName}`;
}

class S3ObjectStorage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, body: Uint8Array, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!response.Body) return null;
      return { body: await response.Body.transformToByteArray(), contentType: response.ContentType };
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async head(key: string) {
    try {
      const response = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: response.ContentLength ?? 0, contentType: response.ContentType };
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === "NotFound" || name === "NoSuchKey") return null;
      throw error;
    }
  }

  async ping() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  // PRD F07: clinical files are served through 5-minute URLs.
  presignGet(key: string, expiresInSeconds = 300) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  presignPut(key: string, contentType: string, expiresInSeconds = 300) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
  }
}

let instance: ObjectStorage | undefined;

export function objectStorage(): ObjectStorage {
  if (!instance) {
    const env = getEnv();
    const client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
    instance = new S3ObjectStorage(client, env.S3_BUCKET);
  }
  return instance;
}
