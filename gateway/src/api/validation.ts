import { z } from 'zod';

/** Flags that attempt to disable security controls — always rejected. */
export const FORBIDDEN_SECURITY_OVERRIDE_KEYS = [
  'sanitize_input',
  'sanitize_output',
  'skip_policy',
  'skip_inspection',
  'bypass_governance',
  'disable_audit',
] as const;

export const completionRequestSchema = z
  .object({
    application_id: z.string().min(1),
    user: z.object({ id: z.string().min(1) }),
    operation: z.string().min(1),
    model: z.string().min(1).optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(['system', 'user', 'assistant']),
          content: z.string(),
        }),
      )
      .min(1),
    metadata: z
      .object({
        correlation_id: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .strict();

export type CompletionRequestBody = z.infer<typeof completionRequestSchema>;

export function findForbiddenOverrides(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const keys = Object.keys(body as Record<string, unknown>);
  return FORBIDDEN_SECURITY_OVERRIDE_KEYS.filter((k) => keys.includes(k));
}
