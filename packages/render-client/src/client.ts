import type {
  RenderService,
  RenderDeploy,
  RenderEnvVar,
  RenderLogEntry,
} from "./types";

const BASE_URL = "https://api.render.com/v1";

export interface RenderClientOpts {
  apiKey: string;
  baseUrl?: string;
}

export class RenderClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(opts: RenderClientOpts) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? BASE_URL;
  }

  // -------------------------------------------------------------------------
  // Services
  // -------------------------------------------------------------------------

  async listServices(limit = 20): Promise<RenderService[]> {
    const data = await this.get<Array<{ service: RenderService }>>(
      `/services?limit=${limit}`,
    );
    return data.map((item) => item.service);
  }

  async getService(serviceId: string): Promise<RenderService> {
    return this.get<RenderService>(`/services/${serviceId}`);
  }

  // -------------------------------------------------------------------------
  // Deploys
  // -------------------------------------------------------------------------

  async createDeploy(
    serviceId: string,
    opts?: { clearCache?: boolean; commitId?: string },
  ): Promise<RenderDeploy> {
    return this.post<RenderDeploy>(`/services/${serviceId}/deploys`, {
      clearCache: opts?.clearCache ? "clear" : "do_not_clear",
      ...(opts?.commitId ? { commitId: opts.commitId } : {}),
    });
  }

  async getDeploy(serviceId: string, deployId: string): Promise<RenderDeploy> {
    return this.get<RenderDeploy>(
      `/services/${serviceId}/deploys/${deployId}`,
    );
  }

  async listDeploys(
    serviceId: string,
    limit = 5,
  ): Promise<RenderDeploy[]> {
    const data = await this.get<Array<{ deploy: RenderDeploy }>>(
      `/services/${serviceId}/deploys?limit=${limit}`,
    );
    return data.map((item) => item.deploy);
  }

  // -------------------------------------------------------------------------
  // Logs
  // -------------------------------------------------------------------------

  async getLogs(
    serviceId: string,
    opts?: { direction?: "forward" | "backward"; limit?: number },
  ): Promise<RenderLogEntry[]> {
    const params = new URLSearchParams();
    if (opts?.direction) params.set("direction", opts.direction);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return this.get<RenderLogEntry[]>(
      `/services/${serviceId}/logs${qs ? `?${qs}` : ""}`,
    );
  }

  // -------------------------------------------------------------------------
  // Environment Variables
  // -------------------------------------------------------------------------

  async listEnvVars(serviceId: string): Promise<RenderEnvVar[]> {
    const data = await this.get<Array<{ envVar: RenderEnvVar }>>(
      `/services/${serviceId}/env-vars?limit=100`,
    );
    return data.map((item) => item.envVar);
  }

  async updateEnvVars(
    serviceId: string,
    envVars: Array<{ key: string; value: string }>,
  ): Promise<RenderEnvVar[]> {
    const data = await this.put<Array<{ envVar: RenderEnvVar }>>(
      `/services/${serviceId}/env-vars`,
      envVars.map((ev) => ({ key: ev.key, value: ev.value })),
    );
    return data.map((item) => item.envVar);
  }

  // -------------------------------------------------------------------------
  // HTTP helpers
  // -------------------------------------------------------------------------

  private async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new RenderApiError(res.status, method, path, text);
    }

    return res.json() as Promise<T>;
  }
}

export class RenderApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly method: string,
    public readonly path: string,
    public readonly body: string,
  ) {
    super(`Render API ${method} ${path} failed (${status}): ${body}`);
    this.name = "RenderApiError";
  }
}
