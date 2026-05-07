/**
 * Render Workflows entry point.
 *
 * Importing task modules registers them with the Render SDK.
 * In local dev mode, the tasks are available for direct invocation.
 */

import "./tasks/run-ci-job";

console.log("[ci-runner] Workflow tasks registered");
