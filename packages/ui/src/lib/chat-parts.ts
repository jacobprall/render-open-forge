import type { StreamEvent } from "@openforge/shared";

export type AssistantTextPart = {
  type: "text";
  text: string;
};

export type AssistantToolCallPart = {
  type: "tool_call";
  toolName: string;
  toolCallId: string;
  args?: unknown;
  result?: unknown;
};

export type AssistantAskUserPart = {
  type: "ask_user";
  question: string;
  options?: string[];
  toolCallId?: string;
};

export type AssistantTaskPart = {
  type: "task";
  task: string;
  taskId?: string;
  status: "running" | "done" | "error";
  result?: string;
  error?: string;
};

export type AssistantFileChangedPart = {
  type: "file_changed";
  path: string;
  additions: number;
  deletions: number;
};

export type AssistantPart =
  | AssistantTextPart
  | AssistantToolCallPart
  | AssistantAskUserPart
  | AssistantTaskPart
  | AssistantFileChangedPart;

export function appendStreamEvent(
  parts: AssistantPart[],
  event: StreamEvent,
): AssistantPart[] {
  switch (event.type) {
    case "token": {
      if (!event.token) return parts;
      const last = parts[parts.length - 1];
      if (last?.type === "text") {
        return [...parts.slice(0, -1), { type: "text", text: last.text + event.token }];
      }
      return [...parts, { type: "text", text: event.token }];
    }

    case "tool_call": {
      if (!event.toolCallId) return parts;
      return [
        ...parts,
        {
          type: "tool_call",
          toolName: event.toolName ?? "tool",
          toolCallId: event.toolCallId,
          args: event.args,
        },
      ];
    }

    case "tool_result": {
      if (!event.toolCallId) return parts;
      return parts.map((p) =>
        p.type === "tool_call" && p.toolCallId === event.toolCallId
          ? { ...p, result: event.result }
          : p,
      );
    }

    case "ask_user": {
      return [
        ...parts,
        {
          type: "ask_user",
          question: event.question ?? "",
          options: event.options,
          toolCallId: event.toolCallId,
        },
      ];
    }

    case "task_start": {
      return [
        ...parts,
        { type: "task", task: event.task ?? "", taskId: event.taskId, status: "running" as const },
      ];
    }

    case "task_done": {
      return parts.map((p) =>
        p.type === "task" &&
        (event.taskId ? p.taskId === event.taskId : !p.taskId && p.task === event.task)
          ? { ...p, status: "done" as const, result: typeof event.result === "string" ? event.result : undefined }
          : p,
      );
    }

    case "task_error": {
      return parts.map((p) =>
        p.type === "task" &&
        (event.taskId ? p.taskId === event.taskId : !p.taskId && p.task === event.task)
          ? { ...p, status: "error" as const, error: event.message }
          : p,
      );
    }

    case "file_changed": {
      if (!event.path) return parts;
      return [
        ...parts,
        { type: "file_changed" as const, path: event.path, additions: event.additions ?? 0, deletions: event.deletions ?? 0 },
      ];
    }

    default:
      return parts;
  }
}
