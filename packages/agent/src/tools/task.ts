import { generateText, stepCountIs, tool } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getAdapter, getSessionId, isForgeAgentContext, type ForgeAgentContext } from "../context/agent-context";
import { bashTool } from "./bash";
import { readFileTool } from "./read-file";
import { writeFileTool } from "./write-file";
import { globTool } from "./glob";
import { grepTool } from "./grep";
import { gitTool } from "./git";
import { createPullRequestTool } from "./create-pr";
import { editFileTool } from "./edit-file";
import { webFetchTool } from "./web-fetch";

const taskInputSchema = z.object({
  task: z.string().describe("Description of the task for the subagent"),
  context: z.string().optional().describe("Additional context the subagent needs"),
});

export function taskTool(
  publishFn: (event: Record<string, unknown>) => Promise<void>,
) {
  return tool({
    description: "Delegate a self-contained subtask to a focused subagent. Use for parallelizable or isolated work.",
    inputSchema: taskInputSchema,
    execute: async ({ task, context }, { experimental_context }) => {
      const adapter = getAdapter(experimental_context);
      const sessionId = getSessionId(experimental_context);
      const ctx = experimental_context as { model?: import("ai").LanguageModel };

      if (!ctx.model) {
        return { success: false, error: "No model in context" };
      }

      const taskId = nanoid();
      await publishFn({ type: "task_start", task, taskId });

      try {
        const subTools = {
          bash: bashTool(),
          read_file: readFileTool(),
          write_file: writeFileTool(),
          glob: globTool(),
          grep: grepTool(),
          git: gitTool(),
          create_pull_request: createPullRequestTool(),
          edit: editFileTool(),
          web_fetch: webFetchTool,
        };

        const parentCtx = isForgeAgentContext(experimental_context) ? experimental_context : null;
        const subCtx: ForgeAgentContext = {
          __brand: "ForgeAgentContext",
          sessionId,
          adapter,
          forgejoClient: parentCtx!.forgejoClient,
          repoOwner: parentCtx!.repoOwner,
          repoName: parentCtx!.repoName,
          branch: parentCtx!.branch,
          baseBranch: parentCtx!.baseBranch,
          ...(parentCtx?.onFileChanged ? { onFileChanged: parentCtx.onFileChanged } : {}),
        };

        const result = await generateText({
          model: ctx.model,
          system: `You are a focused subagent completing a specific task. ${context ?? ""}`,
          messages: [{ role: "user" as const, content: task }],
          tools: subTools,
          stopWhen: stepCountIs(20),
          experimental_context: subCtx,
        });

        await publishFn({ type: "task_done", task, taskId, result: result.text });
        return { success: true, result: result.text };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await publishFn({ type: "task_error", task, taskId, message });
        return { success: false, error: message };
      }
    },
  });
}
