import { createMiddleware } from "hono/factory";

export const requestLogger = createMiddleware(async (c, next) => {
  const start = performance.now();
  await next();
  const ms = (performance.now() - start).toFixed(1);
  const status = c.res.status;
  const method = c.req.method;
  const path = c.req.path;
  console.log(`${method} ${path} ${status} ${ms}ms`);
});
