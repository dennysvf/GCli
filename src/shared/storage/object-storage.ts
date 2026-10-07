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
  presignGet(key: string, expiresInSeconds?: number, options?: PresignGetOptions): Promise<string>;
  presignPut(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
  // Upload URL for the browser (ADR-031): signed against the public endpoint, with the content
  // type and the exact size signed so the bucket refuses any other body.
  presignBrowserPut(
    key: string,
    contentType: string,
    contentLength: number,
    expiresInSeconds?: number,
  ): Promise<string>;
  // Download URL for the browser, signed against the public endpoint (ADR-031).
  presignBrowserGet(key: string, expiresInSeconds?: number, options?: PresignGetOptions): Promise<string>;
  // First bytes of an object, to check the real file type (magic bytes).
  getRange(key: string, length: number): Promise<Uint8Array | null>;
}

export type PresignGetOptions = { contentDisposition?: string };

export function objectKey(organizationId: string, module: string, fileName: string): string {
  return `org/${organizationId}/${module}/${fileName}`;
}

class S3ObjectStorage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    // Same credentials, but the endpoint that browsers reach (S3_PUBLIC_ENDPOINT, ADR-031).
    private readonly publicClient: S3Client = client,
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

  async getRange(key: string, length: number) {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${length - 1}` }),
      );
      return response.Body ? await response.Body.transformToByteArray() : null;
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  }

  // PRD F07: clinical files are served through 5-minute URLs.
  presignGet(key: string, expiresInSeconds = 300, options: PresignGetOptions = {}) {
    return getSignedUrl(this.client, this.getCommand(key, options), { expiresIn: expiresInSeconds });
  }

  presignBrowserGet(key: string, expiresInSeconds = 300, options: PresignGetOptions = {}) {
    return getSignedUrl(this.publicClient, this.getCommand(key, options), { expiresIn: expiresInSeconds });
  }

  private getCommand(key: string, options: PresignGetOptions) {
    return new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: options.contentDisposition,
    });
  }

  presignBrowserPut(key: string, contentType: string, contentLength: number, expiresInSeconds = 300) {
    return getSignedUrl(
      this.publicClient,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
      { expiresIn: expiresInSeconds, signableHeaders: new Set(["content-type", "content-length"]) },
    );
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
    const create = (endpoint: string | undefined) =>
      new S3Client({
        endpoint,
        region: env.S3_REGION,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        // Presigned URLs must not carry the checksum of an empty body (ADR-031): the browser sends the real file.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
        credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
      });
    const client = create(env.S3_ENDPOINT);
    const publicEndpoint = env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT;
    instance = new S3ObjectStorage(
      client,
      env.S3_BUCKET,
      publicEndpoint === env.S3_ENDPOINT ? client : create(publicEndpoint),
    );
  }
  return instance;
}
