import { describe, expect, mock, test } from "bun:test";
import { ExeDevSandboxAdapter, type SshExecFn } from "../../../packages/sandbox/adapters/exedev";
import { ExeDevSandboxProvider } from "../../../packages/sandbox/providers/exedev";

/**
 * Tests use the injectable sshExecFn so they run without an actual exe.dev account.
 * They verify the adapter correctly maps SandboxAdapter operations to SSH commands
 * and the provider correctly handles VM lifecycle.
 */

const okResult = (stdout = "") => ({
  stdout,
  stderr: "",
  exitCode: 0,
  timedOut: false,
  durationMs: 50,
});

const failResult = (stderr = "error") => ({
  stdout: "",
  stderr,
  exitCode: 1,
  timedOut: false,
  durationMs: 50,
});

function createMockSsh() {
  return mock(() => Promise.resolve(okResult())) as unknown as SshExecFn & ReturnType<typeof mock>;
}

function adapterWith(sshMock: SshExecFn) {
  return new ExeDevSandboxAdapter({
    vmHost: "test-vm.exe.xyz",
    workspaceRoot: "/home/exedev/workspace",
    sshExecFn: sshMock,
  });
}

// ─── Adapter Tests ────────────────────────────────────────────────────────────

describe("ExeDevSandboxAdapter", () => {
  test("exec runs command via SSH in session workspace", async () => {
    const ssh = createMockSsh();
    ssh.mockResolvedValueOnce(okResult("hello\n"));
    const adapter = adapterWith(ssh);

    const result = await adapter.exec("sess-1", "echo hello", 30_000);

    expect(result.stdout).toBe("hello\n");
    expect(result.exitCode).toBe(0);
    expect(ssh).toHaveBeenCalledTimes(1);

    const [vmHost, command, opts] = ssh.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(vmHost).toBe("test-vm.exe.xyz");
    expect(command).toBe("echo hello");
    expect(opts.cwd).toBe("/home/exedev/workspace/sess-1");
  });

  test("readFile returns content for existing file", async () => {
    const ssh = createMockSsh();
    ssh.mockResolvedValueOnce(okResult("1024"));
    ssh.mockResolvedValueOnce(okResult("file content"));
    const adapter = adapterWith(ssh);

    const result = await adapter.readFile("sess-1", "src/index.ts");

    expect(result.exists).toBe(true);
    expect(result.content).toBe("file content");
    expect(ssh).toHaveBeenCalledTimes(2);
  });

  test("readFile returns not_found for missing file", async () => {
    const ssh = createMockSsh();
    ssh.mockResolvedValueOnce(failResult("No such file"));
    const adapter = adapterWith(ssh);

    const result = await adapter.readFile("sess-1", "missing.ts");

    expect(result.exists).toBe(false);
    expect(result.errorCode).toBe("not_found");
  });

  test("readFile returns too_large for oversized file", async () => {
    const ssh = createMockSsh();
    ssh.mockResolvedValueOnce(okResult("99999999"));
    const adapter = adapterWith(ssh);

    const result = await adapter.readFile("sess-1", "huge.bin");

    expect(result.exists).toBe(true);
    expect(result.errorCode).toBe("too_large");
  });

  test("writeFile pipes content via SSH stdin", async () => {
    const ssh = createMockSsh();
    ssh.mockResolvedValueOnce(okResult());
    const adapter = adapterWith(ssh);

    await adapter.writeFile("sess-1", "src/app.ts", "const x = 1;");

    expect(ssh).toHaveBeenCalledTimes(1);
    const [, , opts] = ssh.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(opts.stdin).toBe("const x = 1;");
  });

  test("writeFile throws on SSH failure", async () => {
    const ssh = createMockSsh();
    ssh.mockResolvedValueOnce(failResult("permission denied"));
    const adapter = adapterWith(ssh);

    await expect(adapter.writeFile("sess-1", "root.txt", "x")).rejects.toThrow(
      "writeFile failed",
    );
  });

  test("glob returns file list from find output", async () => {
    const ssh = createMockSsh();
    ssh.mockResolvedValueOnce(okResult("./src/a.ts\n./src/b.ts\n"));
    const adapter = adapterWith(ssh);

    const result = await adapter.glob("sess-1", "*.ts");

    expect(result.files).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.truncated).toBeFalsy();
  });

  test("grep parses ripgrep JSON output", async () => {
    const rgOutput = [
      '{"type":"match","data":{"path":{"text":"src/a.ts"},"line_number":5,"lines":{"text":"const foo = 1;"}}}',
      '{"type":"match","data":{"path":{"text":"src/b.ts"},"line_number":10,"lines":{"text":"const foo = 2;"}}}',
    ].join("\n");
    const ssh = createMockSsh();
    ssh.mockResolvedValueOnce(okResult(rgOutput));
    const adapter = adapterWith(ssh);

    const result = await adapter.grep("sess-1", "foo");

    expect(result.matches).toHaveLength(2);
    expect(result.matches[0]).toEqual({
      file: "src/a.ts",
      line: 5,
      content: "const foo = 1;",
    });
  });

  test("git runs git command in session workspace", async () => {
    const ssh = createMockSsh();
    ssh.mockResolvedValueOnce(okResult("On branch main\n"));
    const adapter = adapterWith(ssh);

    const result = await adapter.git("sess-1", ["status"]);

    expect(result.stdout).toContain("On branch main");
    const [, command] = ssh.mock.calls[0] as [string, string];
    expect(command).toContain("git");
    expect(command).toContain("'status'");
  });

  test("snapshot creates tarball and returns size", async () => {
    const ssh = createMockSsh();
    ssh.mockResolvedValueOnce(okResult("4096"));
    const adapter = adapterWith(ssh);

    const result = await adapter.snapshot("sess-1", "snap-abc");

    expect(result.snapshotId).toBe("snap-abc");
    expect(result.sizeBytes).toBe(4096);
    const [, command] = ssh.mock.calls[0] as [string, string];
    expect(command).toContain("tar czf");
    expect(command).toContain("snap-abc.tar.gz");
  });

  test("restore extracts tarball into session dir", async () => {
    const ssh = createMockSsh();
    ssh.mockResolvedValueOnce(okResult());
    const adapter = adapterWith(ssh);

    await adapter.restore("sess-1", "snap-abc");

    const [, command] = ssh.mock.calls[0] as [string, string];
    expect(command).toContain("tar xzf");
    expect(command).toContain("snap-abc.tar.gz");
  });

  test("cloneWorkspace copies session directory", async () => {
    const ssh = createMockSsh();
    ssh.mockResolvedValueOnce(okResult());
    const adapter = adapterWith(ssh);

    await adapter.cloneWorkspace("sess-1", "sess-2");

    const [, command] = ssh.mock.calls[0] as [string, string];
    expect(command).toContain("cp -a");
    expect(command).toContain("sess-1");
    expect(command).toContain("sess-2");
  });

  test("verify runs each check and maps results", async () => {
    const ssh = createMockSsh();
    ssh
      .mockResolvedValueOnce(okResult("all good"))
      .mockResolvedValueOnce(failResult("lint error"));
    const adapter = adapterWith(ssh);

    const results = await adapter.verify("sess-1", [
      { name: "test", command: "npm test" },
      { name: "lint", command: "npm run lint" },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.name).toBe("test");
    expect(results[1]!.status).toBe("fail");
    expect(results[1]!.name).toBe("lint");
  });
});

// ─── Provider Tests ───────────────────────────────────────────────────────────

describe("ExeDevSandboxProvider", () => {
  test("type is 'exedev'", () => {
    const provider = new ExeDevSandboxProvider({
      auth: { bearerToken: "test-token" },
    });
    expect(provider.type).toBe("exedev");
  });

  test("health reports not ready when no VM provisioned", async () => {
    const provider = new ExeDevSandboxProvider({
      auth: { bearerToken: "test-token" },
    });

    const h = await provider.health("sess-1");
    expect(h.ready).toBe(false);
    expect(h.type).toBe("exedev");
  });

  test("deprovision is a no-op for shared-vm strategy", async () => {
    const provider = new ExeDevSandboxProvider({
      auth: { bearerToken: "test-token" },
      vmStrategy: "shared-vm",
    });

    await expect(provider.deprovision("sess-1")).resolves.toBeUndefined();
  });
});
