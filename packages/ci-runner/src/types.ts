export interface CIStep {
  name?: string;
  run: string;
  env?: Record<string, string>;
}

export interface CIJob {
  name: string;
  steps: CIStep[];
}

export interface CIJobInput {
  cloneUrl: string;
  branch: string;
  commitSha: string;
  workflowName: string;
  jobs: CIJob[];
  callbackUrl?: string;
  callbackSecret?: string;
  ciEventId: string;
}

export interface StepResult {
  name: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface CIJobResult {
  ciEventId: string;
  workflowName: string;
  status: "success" | "failure" | "error";
  jobs: Array<{
    name: string;
    status: "success" | "failure" | "error";
    steps: StepResult[];
    durationMs: number;
  }>;
  testResults?: {
    junitXml?: string;
    tapOutput?: string;
  };
  totalDurationMs: number;
}
