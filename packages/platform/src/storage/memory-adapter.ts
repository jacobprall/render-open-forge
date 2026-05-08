import type {
  StorageAdapter,
  StorageObject,
  ListObjectsOptions,
  ListObjectsResult,
  PutObjectOptions,
  GetObjectResult,
} from "../interfaces/storage";

interface MemoryEntry {
  data: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
  lastModified: Date;
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, MemoryEntry>();

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  async put(
    key: string,
    body: ReadableStream<Uint8Array> | Buffer | Uint8Array | string,
    opts?: PutObjectOptions,
  ): Promise<void> {
    let data: Buffer;

    if (body instanceof ReadableStream) {
      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      data = Buffer.concat(chunks);
    } else if (typeof body === "string") {
      data = Buffer.from(body, "utf8");
    } else if (body instanceof Buffer) {
      data = body;
    } else {
      data = Buffer.from(body);
    }

    this.store.set(key, {
      data,
      contentType: opts?.contentType,
      metadata: opts?.metadata,
      lastModified: new Date(),
    });
  }

  async get(key: string): Promise<GetObjectResult> {
    const entry = this.store.get(key);
    if (!entry) {
      throw new Error(`Object not found: ${key}`);
    }

    const buf = entry.data;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(buf);
        controller.close();
      },
    });

    return {
      body,
      contentType: entry.contentType,
      contentLength: entry.data.byteLength,
      metadata: entry.metadata,
    };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.store.delete(key);
    }
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async list(opts?: ListObjectsOptions): Promise<ListObjectsResult> {
    const prefix = opts?.prefix ?? "";
    const maxKeys = opts?.maxKeys ?? 1000;
    const continuationToken = opts?.continuationToken;

    const matchingKeys = Array.from(this.store.keys())
      .filter((k) => k.startsWith(prefix))
      .sort();

    let startIdx = 0;
    if (continuationToken) {
      const idx = matchingKeys.indexOf(continuationToken);
      startIdx = idx === -1 ? 0 : idx;
    }

    const page = matchingKeys.slice(startIdx, startIdx + maxKeys);
    const isTruncated = startIdx + maxKeys < matchingKeys.length;

    const objects: StorageObject[] = page.map((key) => {
      const entry = this.store.get(key)!;
      return {
        key,
        size: entry.data.byteLength,
        lastModified: entry.lastModified,
        contentType: entry.contentType,
      };
    });

    return {
      objects,
      isTruncated,
      nextContinuationToken: isTruncated ? page[page.length - 1] : undefined,
    };
  }

  async getSignedUrl(key: string, _expiresInSeconds?: number): Promise<string> {
    return `memory://${key}`;
  }
}
