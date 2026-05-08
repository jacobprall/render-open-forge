/**
 * Pluggable object-storage abstraction.
 *
 * Default implementation targets S3-compatible APIs (MinIO, AWS S3, R2, etc.).
 * A local-filesystem adapter is provided for dev without an object store,
 * and a memory adapter for unit tests.
 */

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
  contentType?: string;
}

export interface ListObjectsOptions {
  prefix?: string;
  /** Max keys to return per page. Defaults to 1000. */
  maxKeys?: number;
  /** Opaque token from a previous `ListObjectsResult` for pagination. */
  continuationToken?: string;
}

export interface ListObjectsResult {
  objects: StorageObject[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export interface PutObjectOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface GetObjectResult {
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// StorageAdapter interface
// ---------------------------------------------------------------------------

/**
 * Minimal object-storage contract.
 *
 * Adapters are bucket-scoped: construct one per logical bucket.
 * Key paths use forward-slash separators (e.g. `sessions/abc/snapshot.tar.gz`).
 */
export interface StorageAdapter {
  /** Upload an object. Overwrites if the key already exists. */
  put(
    key: string,
    body: ReadableStream<Uint8Array> | Buffer | Uint8Array | string,
    opts?: PutObjectOptions,
  ): Promise<void>;

  /** Retrieve an object. Throws if not found. */
  get(key: string): Promise<GetObjectResult>;

  /** Delete a single object. No-op if the key does not exist. */
  delete(key: string): Promise<void>;

  /** Delete multiple objects in one call. No-op for missing keys. */
  deleteMany(keys: string[]): Promise<void>;

  /** Check whether an object exists without fetching its body. */
  exists(key: string): Promise<boolean>;

  /** List objects, optionally filtered by prefix, with pagination. */
  list(opts?: ListObjectsOptions): Promise<ListObjectsResult>;

  /**
   * Generate a pre-signed URL for direct GET access.
   * @param expiresInSeconds Defaults to 3600 (1 hour).
   */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

// ---------------------------------------------------------------------------
// S3-compatible adapter config
// ---------------------------------------------------------------------------

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Use path-style URLs (required for MinIO). Defaults to true. */
  forcePathStyle?: boolean;
}
