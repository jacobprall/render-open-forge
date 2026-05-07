import { tool } from "ai";
import { z } from "zod";

const todoWriteInputSchema = z.object({
  todos: z.array(z.object({
    id: z.string(),
    content: z.string(),
    status: z.enum(["pending", "in_progress", "completed"]),
  })),
  merge: z.boolean().describe("If true, merge with existing todos. If false, replace."),
});

type Todo = { id: string; content: string; status: "pending" | "in_progress" | "completed" };

export function todoWriteTool() {
  let todos: Todo[] = [];

  return tool({
    description: "Manage a structured task list for the current session.",
    inputSchema: todoWriteInputSchema,
    execute: async ({ todos: incoming, merge }) => {
      if (merge) {
        for (const todo of incoming) {
          const idx = todos.findIndex((t) => t.id === todo.id);
          if (idx >= 0) {
            todos[idx] = { ...todos[idx]!, ...todo };
          } else {
            todos.push(todo);
          }
        }
      } else {
        todos = incoming;
      }
      return { todos };
    },
  });
}
