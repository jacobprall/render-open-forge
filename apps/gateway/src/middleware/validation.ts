import type { z } from "zod";

/**
 * Flatten a Zod error into a human-readable string.
 * Clients expect `{ error: string }`, not `{ error: { formErrors, fieldErrors } }`.
 */
export function formatZodError(error: z.ZodError): string {
  const flat = error.flatten();
  const parts: string[] = [...flat.formErrors];
  for (const [field, msgs] of Object.entries(flat.fieldErrors)) {
    const arr = msgs as string[] | undefined;
    if (arr?.length) {
      parts.push(`${field}: ${arr.join(", ")}`);
    }
  }
  return parts.length > 0 ? parts.join("; ") : "Validation error";
}
