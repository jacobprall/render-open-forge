import { z } from "zod";

const ciStepResultSchema = z.object({
  name: z.string(),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number(),
});

const ciJobResultSchema = z.object({
  name: z.string(),
  status: z.enum(["success", "failure", "error"]),
  steps: z.array(ciStepResultSchema),
  durationMs: z.number(),
});

export const ciResultPayloadSchema = z.object({
  ciEventId: z.string().min(1),
  workflowName: z.string(),
  status: z.enum(["success", "failure", "error"]),
  jobs: z.array(ciJobResultSchema),
  testResults: z
    .object({
      junitXml: z.string().optional(),
      tapOutput: z.string().optional(),
    })
    .optional(),
  totalDurationMs: z.number(),
});

export type CIResultPayload = z.infer<typeof ciResultPayloadSchema>;
