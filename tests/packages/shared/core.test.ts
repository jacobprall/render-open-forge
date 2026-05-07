import { describe, expect, test } from "bun:test";
import {
  appendStreamEvent,
  createEditDiffLines,
  createNewFileCodeLines,
  createPasteToken,
  createUnifiedDiff,
  expandPasteTokens,
  extractPasteTokens,
  extractRenderState,
  formatPastePlaceholder,
  formatTokens,
  getLanguageFromPath,
  getStatusColor,
  getStatusLabel,
  splitLines,
  toRelativePath,
  type AssistantPart,
  type PasteBlock,
} from "../../../packages/shared";

describe("shared chat stream reducer", () => {
  test("combines adjacent text tokens without mutating existing parts", () => {
    const initial: AssistantPart[] = Object.freeze([
      { type: "text", text: "hello" },
    ]) as AssistantPart[];

    const result = appendStreamEvent(initial, {
      type: "token",
      token: " world",
    });

    expect(result).toEqual([{ type: "text", text: "hello world" }]);
    expect(initial).toEqual([{ type: "text", text: "hello" }]);
  });

  test("attaches tool results to the matching call only", () => {
    const parts: AssistantPart[] = [
      { type: "tool_call", toolName: "bash", toolCallId: "a" },
      { type: "tool_call", toolName: "read", toolCallId: "b" },
    ];

    expect(
      appendStreamEvent(parts, {
        type: "tool_result",
        toolCallId: "b",
        result: { content: "ok" },
      }),
    ).toEqual([
      { type: "tool_call", toolName: "bash", toolCallId: "a" },
      {
        type: "tool_call",
        toolName: "read",
        toolCallId: "b",
        result: { content: "ok" },
      },
    ]);
  });

  test("drops tool_call events with missing toolCallId", () => {
    const parts: AssistantPart[] = [
      { type: "text", text: "hello" },
    ];

    const result = appendStreamEvent(parts, {
      type: "tool_call",
      toolName: "bash",
    });

    expect(result).toEqual([{ type: "text", text: "hello" }]);
  });

  test("tracks task lifecycle events by task name", () => {
    const running = appendStreamEvent([], {
      type: "task_start",
      task: "inspect",
    });
    const done = appendStreamEvent(running, {
      type: "task_done",
      task: "inspect",
      result: "finished",
    });

    expect(done).toEqual([
      {
        type: "task",
        task: "inspect",
        status: "done",
        result: "finished",
      },
    ]);
  });

  test("disambiguates concurrent tasks with matching descriptions via taskId", () => {
    const a = appendStreamEvent([], { type: "task_start", task: "Run tests", taskId: "t1" });
    const ab = appendStreamEvent(a, { type: "task_start", task: "Run tests", taskId: "t2" });
    const finished = appendStreamEvent(ab, {
      type: "task_done",
      task: "Run tests",
      taskId: "t1",
      result: "ok",
    });

    expect(finished).toEqual([
      { type: "task", task: "Run tests", taskId: "t1", status: "done", result: "ok" },
      { type: "task", task: "Run tests", taskId: "t2", status: "running" },
    ]);
  });
});

describe("shared paste block helpers", () => {
  test("round-trips paste tokens through extraction and expansion", () => {
    const token = createPasteToken(7);
    const blocks = new Map<string, PasteBlock>([
      [token, { id: 7, token, text: "first\nsecond", lineCount: 2 }],
    ]);

    expect(extractPasteTokens(`before ${token} after`)).toEqual(new Set([token]));
    expect(expandPasteTokens(`before ${token} after`, blocks)).toBe(
      "before first\nsecond after",
    );
  });

  test("formats human-readable paste placeholders", () => {
    expect(formatPastePlaceholder(1, 1)).toBe("[Pasted text #1 +1 line]");
    expect(formatPastePlaceholder(2, 3)).toBe("[Pasted text #2 +3 lines]");
  });
});

describe("shared diff helpers", () => {
  test("normalizes trailing file newlines when splitting content", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("")).toEqual([]);
  });

  test("summarizes edit previews with stable line numbers and counts", () => {
    expect(createEditDiffLines("old\nvalue", "new", 10)).toEqual({
      additions: 1,
      removals: 2,
      lines: [
        { type: "removal", lineNumber: 10, content: "old" },
        { type: "removal", lineNumber: 11, content: "value" },
        { type: "addition", lineNumber: 10, content: "new" },
      ],
    });
  });

  test("builds unified diffs that include file paths and change counts", () => {
    expect(createUnifiedDiff("a", "b\nc", "src/file.ts", 3)).toEqual({
      additions: 2,
      removals: 1,
      diff: "--- a/src/file.ts\n+++ b/src/file.ts\n@@ -3,1 +3,2 @@\n-a\n+b\n+c",
    });
  });

  test("uses file extensions to select highlighter language", () => {
    expect(getLanguageFromPath("component.tsx")).toBe("typescript");
    expect(getLanguageFromPath("Dockerfile")).toBeUndefined();
  });

  test("previews new files through an optional highlighter", () => {
    const result = createNewFileCodeLines(
      "const a = 1;\nconst b = 2;\nconst c = 3;",
      "example.ts",
      (code, language) => `${language}:${code.toUpperCase()}`,
      2,
    );

    expect(result).toEqual({
      totalLines: 3,
      hiddenLines: 1,
      lines: [
        { content: "const a = 1;", highlighted: "typescript:CONST A = 1;" },
        { content: "const b = 2;", highlighted: "CONST B = 2;" },
      ],
    });
  });
});

describe("shared tool render state", () => {
  test("derives running, interrupted, approval, denial, and error states", () => {
    expect(
      extractRenderState({ state: "input-streaming" }, null, true),
    ).toMatchObject({ running: true, interrupted: false });
    expect(
      extractRenderState({ state: "input-streaming" }, null, false),
    ).toMatchObject({ running: false, interrupted: true });
    expect(
      extractRenderState(
        { state: "approval-requested", approval: { id: "approval-1" } },
        "approval-1",
        true,
      ),
    ).toMatchObject({ approvalRequested: true, isActiveApproval: true });
    expect(
      extractRenderState(
        {
          state: "output-denied",
          approval: { approved: false, reason: "not allowed" },
        },
        null,
        false,
      ),
    ).toMatchObject({ denied: true, denialReason: "not allowed" });
    expect(
      extractRenderState({ state: "output-error", errorText: "boom" }, null, false),
    ).toMatchObject({ error: "boom" });
  });

  test("maps render state to user-facing status", () => {
    const denied = {
      running: false,
      interrupted: false,
      denied: true,
      denialReason: "secret",
      approvalRequested: false,
      isActiveApproval: false,
    };

    expect(getStatusColor(denied)).toBe("red");
    expect(getStatusLabel(denied)).toBe("Denied: secret");
    expect(formatTokens(999_950)).toBe("1.0m");
    expect(toRelativePath("/repo/src/index.ts", "/repo")).toBe("src/index.ts");
  });
});
