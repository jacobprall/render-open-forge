let shuttingDown = false;

export function setupGracefulShutdown(cleanup: () => Promise<void>): void {
  const handler = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down gracefully...`);
    const timeout = setTimeout(() => process.exit(1), 60_000);
    try {
      await cleanup();
    } finally {
      clearTimeout(timeout);
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void handler("SIGTERM"));
  process.on("SIGINT", () => void handler("SIGINT"));
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
