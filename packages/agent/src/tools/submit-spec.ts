import { tool } from "ai";
import { z } from "zod";
import { nanoid } from "nanoid";
import { desc, eq } from "drizzle-orm";
import { specs } from "@render-open-forge/db";
import { getDb } from "../db";
import type { StreamEvent } from "../types";

const specShape = z.object({
  goal: z.string(),
  approach: z.string(),
  filesToModify: z.array(z.string()).optional(),
  filesToCreate: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  outOfScope: z.array(z.string()).optional(),
  verificationPlan: z.string(),
  estimatedComplexity: z.enum(["trivial", "small", "medium", "large"]).optional(),
});

export function submitSpecTool(
  publish: (event: StreamEvent) => Promise<void>,
  sessionId: string,
) {
  return tool({
    description:
      "Submit a structured implementation specification for human approval before coding.",
    inputSchema: specShape,
    execute: async (spec) => {
      await publish({ type: "spec", spec });

      const db = getDb();
      const [latest] = await db
        .select()
        .from(specs)
        .where(eq(specs.sessionId, sessionId))
        .orderBy(desc(specs.version))
        .limit(1);

      await db.insert(specs).values({
        id: nanoid(),
        sessionId,
        version: (latest?.version ?? 0) + 1,
        status: "draft",
        goal: spec.goal,
        approach: spec.approach,
        filesToModify: spec.filesToModify ?? [],
        filesToCreate: spec.filesToCreate ?? [],
        risks: spec.risks ?? [],
        outOfScope: spec.outOfScope ?? [],
        verificationPlan: spec.verificationPlan,
        estimatedComplexity: spec.estimatedComplexity ?? "small",
      });

      return { success: true as const };
    },
  });
}
