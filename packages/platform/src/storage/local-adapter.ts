import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type {
  StorageAdapter,
  StorageObject,
  ListObjectsOptions,
  ListObjectsResult,
  PutObjectOptions,
  GetObjectResult,
} from "../interfaces/storage";

export class LocalStorageAdapter implements StorageAdapter {
  private readonly basePath: string;

  constructor({ basePath }: { basePath: string }) {
    this.basePath = basePath;
  }

  private keyToPath(key: string): string {
    return path.join(this.basePath, key);
  }

  private metaPath(filePath: string): string {
    return `${filePath}.__meta__.json`;
  }

  async put(
    key: string,
    body: ReadableStream<Uint8Array> | Buffer | Uint8Array | string,
    opts?: PutObjectOptions,
  ): Promise<void> {
    const filePath = this.keyToPath(key);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });

    if (body instanceof ReadableStream) {
      const nodeStream = Readable.fromWeb(body as unknown as Parameters<typeof Readable.fromWeb>[0]);
      const writeStream = fs.createWriteStream(filePath);
      await new Promise<void>((resolve, reject) => {
        nodeStream.pipe(writeStream);
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
        nodeStream.on("error", reject);
      });
    } else if (typeof body === "string") {
      await fsp.writeFile(filePath, Buffer.from(body, "utf8"));
    } else {
      await fsp.writeFile(filePath, body);
    }

    if (opts?.metadata && Object.keys(opts.metadata).length > 0) {
      await fsp.writeFile(
        this.metaPath(filePath),
        JSON.stringify(opts.metadata),
        "utf8",
      );
    }
  }

  async get(key: string): Promise<GetObjectResult> {
    const filePath = this.keyToPath(key);

    try {
      await fsp.access(filePath);
    } catch {
      throw new Error(`Object not found: ${key}`);
    }

    const stats = await fsp.stat(filePath);
    const nodeStream = fs.createReadStream(filePath);
    const body = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

    let metadata: Record<string, string> | undefined;
    try {
      const raw = await fsp.readFile(this.metaPath(filePath), "utf8");
      metadata = JSON.parse(raw) as Record<string, string>;
    } catch {
      // no sidecar — that's fine
    }

    return {
      body,
      contentLength: stats.size,
      metadata,
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = this.keyToPath(key);
    try {
      await fsp.unlink(filePath);
      // Best-effort cleanup of sidecar
      await fsp.unlink(this.metaPath(filePath)).catch(() => undefined);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => this.delete(k)));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fsp.access(this.keyToPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async list(opts?: ListObjectsOptions): Promise<ListObjectsResult> {
    const prefix = opts?.prefix ?? "";
    const maxKeys = opts?.maxKeys ?? 1000;
    const continuationToken = opts?.continuationToken;

    let allFiles: string[] = [];
    try {
      allFiles = await this.readdirRecursive(this.basePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { objects: [], isTruncated: false };
      }
      throw err;
    }

    const relativeKeys = allFiles
      .map((f) => path.relative(this.basePath, f).split(path.sep).join("/"))
      // Exclude sidecar meta files
      .filter((k) => !k.endsWith(".__meta__.json"))
      .filter((k) => k.startsWith(prefix))
      .sort();

    let startIdx = 0;
    if (continuationToken) {
      const idx = relativeKeys.indexOf(continuationToken);
      startIdx = idx === -1 ? 0 : idx;
    }

    const page = relativeKeys.slice(startIdx, startIdx + maxKeys);
    const isTruncated = startIdx + maxKeys < relativeKeys.length;

    const objects: StorageObject[] = await Promise.all(
      page.map(async (key) => {
        const stats = await fsp.stat(this.keyToPath(key));
        return {
          key,
          size: stats.size,
          lastModified: stats.mtime,
        };
      }),
    );

    return {
      objects,
      isTruncated,
      nextContinuationToken: isTruncated ? page[page.length - 1] : undefined,
    };
  }

  async getSignedUrl(_key: string, _expiresInSeconds?: number): Promise<string> {
    throw new Error("Signed URLs are not supported by LocalStorageAdapter");
  }

  private async readdirRecursive(dir: string): Promise<string[]> {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await this.readdirRecursive(full)));
      } else {
        results.push(full);
      }
    }
    return results;
  }
}
