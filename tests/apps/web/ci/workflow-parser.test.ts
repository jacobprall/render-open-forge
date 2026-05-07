import { describe, expect, test } from "bun:test";
import { parseWorkflowYaml, shouldTrigger } from "../../../../apps/web/lib/ci/workflow-parser";

describe("workflow-parser", () => {
  test("parses push branch triggers and matches branch", () => {
    const yaml = `
name: CI
on:
  push:
    branches: [main]
jobs:
  build:
    steps:
      - run: echo ok
`;
    const w = parseWorkflowYaml(yaml, "ci.yml");
    expect(w).not.toBeNull();
    expect(shouldTrigger(w!, "push", "main")).toBe(true);
    expect(shouldTrigger(w!, "push", "dev")).toBe(false);
  });

  test("boolean on: true yields empty triggers so workflow never matches", () => {
    const yaml = `
name: broken
on: true
jobs:
  build:
    steps:
      - run: echo hi
`;
    const w = parseWorkflowYaml(yaml, "broken.yml");
    expect(w).not.toBeNull();
    expect(shouldTrigger(w!, "push", "main")).toBe(false);
    expect(shouldTrigger(w!, "pull_request", "main")).toBe(false);
  });
});
