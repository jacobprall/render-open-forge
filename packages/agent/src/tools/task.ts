import { generateText, stepCountIs, tool, type LanguageModel, type ToolSet } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getSandboxContext, isForgeAgentContext, type ForgeAgentContext } from "../context/agent-context";

const MAX_SUBAGENT_STEPS = 20;

const taskInputSchema = z.object({
  task: z.string().describe("Description of the task for the subagent"),
  context: z.string().optional().describe("Additional context the subagent needs"),
});

export function taskTool(
  publishFn: (event: Record<string, unknown>) => Promise<void>,
  buildSubTools: () => ToolSet,
  model: LanguageModel,
  parentSystemPromptSuffix?: string,
) {
  return tool({
    description: "Delegate a self-contained subtask to a focused subagent. Use for parallelizable or isolated work.",
    inputSchema: taskInputSchema,
    execute: async ({ task, context }, { experimental_context }) => {
      const { adapter, sessionId } = getSandboxContext(experimental_context);

      if (!isForgeAgentContext(experimental_context)) {
        return { success: false, error: "Forge context required for task delegation" };
      }
      const parentCtx = experimental_context;

      const taskId = nanoid();
      await publishFn({ type: "task_start", task, taskId });

      try {
        const subTools = buildSubTools();

        const subCtx: ForgeAgentContext = {
          __brand: "ForgeAgentContext",
          sessionId,
          adapter,
          forge: parentCtx.forge,
          repoOwner: parentCtx.repoOwner,
          repoName: parentCtx.repoName,
          branch: parentCtx.branch,
          baseBranch: parentCtx.baseBranch,
          ...(parentCtx.onFileChanged ? { onFileChanged: parentCtx.onFileChanged } : {}),
          ...(parentCtx.onPrCreated ? { onPrCreated: parentCtx.onPrCreated } : {}),
        };

        const subSystem = [
          `You are a focused subagent completing a specific task.`,
          parentSystemPromptSuffix ?? "",
          context ?? "",
        ].filter(Boolean).join("\n\n");

        const result = await generateText({
          model,
          system: subSystem,
          messages: [{ role: "user" as const, content: task }],
          tools: subTools,
          stopWhen: stepCountIs(MAX_SUBAGENT_STEPS),
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
