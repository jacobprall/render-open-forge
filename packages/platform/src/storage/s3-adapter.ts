import { Readable } from "node:stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  StorageAdapter,
  StorageObject,
  ListObjectsOptions,
  ListObjectsResult,
  PutObjectOptions,
  GetObjectResult,
  S3StorageConfig,
} from "../interfaces/storage";

export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(
    key: string,
    body: ReadableStream<Uint8Array> | Buffer | Uint8Array | string,
    opts?: PutObjectOptions,
  ): Promise<void> {
    let sdkBody: Buffer | Uint8Array;

    if (body instanceof ReadableStream) {
      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      sdkBody = Buffer.concat(chunks);
    } else if (typeof body === "string") {
      sdkBody = Buffer.from(body, "utf8");
    } else {
      sdkBody = body;
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: sdkBody,
        ContentType: opts?.contentType,
        Metadata: opts?.metadata,
      }),
    );
  }

  async get(key: string): Promise<GetObjectResult> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    const sdkBody = response.Body;
    if (!sdkBody) {
      throw new Error(`Object body is empty for key: ${key}`);
    }

    let webStream: ReadableStream<Uint8Array>;
    if ("transformToWebStream" in sdkBody && typeof (sdkBody as { transformToWebStream: unknown }).transformToWebStream === "function") {
      webStream = (sdkBody as { transformToWebStream(): ReadableStream<Uint8Array> }).transformToWebStream();
    } else if (sdkBody instanceof Readable) {
      webStream = Readable.toWeb(sdkBody) as unknown as ReadableStream<Uint8Array>;
    } else {
      throw new Error(`Unexpected Body type for key: ${key}`);
    }

    const metadata: Record<string, string> | undefined = response.Metadata && Object.keys(response.Metadata).length > 0
      ? response.Metadata as Record<string, string>
      : undefined;

    return {
      body: webStream,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      metadata,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    // S3 DeleteObjects supports up to 1000 keys per request
    const chunks: string[][] = [];
    for (let i = 0; i < keys.length; i += 1000) {
      chunks.push(keys.slice(i, i + 1000));
    }

    await Promise.all(
      chunks.map((chunk) =>
        this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: chunk.map((Key) => ({ Key })) },
          }),
        ),
      ),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err) {
      const code = (err as { name?: string; Code?: string }).name ?? (err as { Code?: string }).Code;
      if (code === "NotFound" || code === "NoSuchKey" || code === "403") {
        return false;
      }
      throw err;
    }
  }

  async list(opts?: ListObjectsOptions): Promise<ListObjectsResult> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: opts?.prefix,
        MaxKeys: opts?.maxKeys,
        ContinuationToken: opts?.continuationToken,
      }),
    );

    const objects: StorageObject[] = (response.Contents ?? []).map((obj) => ({
      key: obj.Key!,
      size: obj.Size ?? 0,
      lastModified: obj.LastModified ?? new Date(),
      etag: obj.ETag,
    }));

    return {
      objects,
      isTruncated: response.IsTruncated ?? false,
      nextContinuationToken: response.NextContinuationToken,
    };
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return awsGetSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}
