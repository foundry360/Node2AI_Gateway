/**
 * Canonical Action / operation catalog (platform-agnostic).
 *
 * Categories are the closed consequence taxonomy.
 * Operations are the curated request vocabulary clients and Tools should use.
 * Finer detail (field, target, system) belongs in attributes + policy — not more ops.
 */

export const ACTION_CATEGORIES = [
  {
    id: 'READ',
    label: 'Read',
    description: 'Retrieve, summarize, classify, or generate from existing content.',
  },
  {
    id: 'CREATE',
    label: 'Create',
    description: 'Create a new record or artifact (e.g. clinical note).',
  },
  {
    id: 'UPDATE',
    label: 'Update',
    description: 'Modify an existing record or field.',
  },
  {
    id: 'DELETE',
    label: 'Delete',
    description: 'Remove a record or artifact.',
  },
  {
    id: 'EXECUTE',
    label: 'Execute',
    description: 'Run a governed procedure or job.',
  },
  {
    id: 'TRANSMIT',
    label: 'Transmit',
    description: 'Export, share, or send data outside the boundary.',
  },
  {
    id: 'INVOKE',
    label: 'Invoke',
    description: 'Call another tool, agent, or system capability.',
  },
  {
    id: 'OTHER',
    label: 'Other',
    description: 'Unclassified operation — policy should fail closed when unsure.',
  },
] as const;

export type ActionCategoryId = (typeof ACTION_CATEGORIES)[number]['id'];

/**
 * Curated request / tool operation vocabulary (~10).
 * Prefer these over inventing per-field or per-API verbs.
 */
export const ACTION_OPERATIONS = [
  {
    id: 'summarize',
    label: 'Summarize',
    category: 'READ',
    description: 'Produce a summary of provided content.',
  },
  {
    id: 'classify',
    label: 'Classify',
    category: 'READ',
    description: 'Assign labels or categories to content.',
  },
  {
    id: 'generate',
    label: 'Generate',
    category: 'READ',
    description: 'Generate text or structured output from a prompt.',
  },
  {
    id: 'read',
    label: 'Read',
    category: 'READ',
    description: 'Retrieve or inspect existing records without mutation.',
  },
  {
    id: 'write',
    label: 'Write',
    category: 'UPDATE',
    description: 'Governed mutation when no finer action.kind is supplied.',
  },
  {
    id: 'field_update',
    label: 'Field update',
    category: 'UPDATE',
    description: 'Update a specific field (common action.kind / tool operation).',
  },
  {
    id: 'clinical_note',
    label: 'Clinical note',
    category: 'CREATE',
    description: 'Create or append a clinical note (common action.kind / tool operation).',
  },
  {
    id: 'create',
    label: 'Create',
    category: 'CREATE',
    description: 'Create a new record.',
  },
  {
    id: 'update',
    label: 'Update',
    category: 'UPDATE',
    description: 'Update an existing record.',
  },
  {
    id: 'delete',
    label: 'Delete',
    category: 'DELETE',
    description: 'Delete a record.',
  },
  {
    id: 'export',
    label: 'Export',
    category: 'TRANSMIT',
    description: 'Export data out of the governed boundary.',
  },
  {
    id: 'transmit',
    label: 'Transmit',
    category: 'TRANSMIT',
    description: 'Send or share data to an external recipient.',
  },
  {
    id: 'execute',
    label: 'Execute',
    category: 'EXECUTE',
    description: 'Execute a governed procedure.',
  },
  {
    id: 'invoke',
    label: 'Invoke',
    category: 'INVOKE',
    description: 'Invoke another capability or tool.',
  },
] as const;

export type ActionOperationId = (typeof ACTION_OPERATIONS)[number]['id'];

/** Write subtypes also registered as catalog operations (matched via action.kind). */
export const WRITE_ACTION_KINDS = [
  {
    id: 'field_update',
    label: 'Field update',
    description: 'Update a specific field on a target record.',
  },
  {
    id: 'clinical_note',
    label: 'Clinical note',
    description: 'Append or create a clinical note.',
  },
] as const;

export type WriteActionKindId = (typeof WRITE_ACTION_KINDS)[number]['id'];

const OPERATION_IDS = new Set<string>(
  ACTION_OPERATIONS.map((o) => o.id),
);

export function isCatalogOperation(id: string): boolean {
  return OPERATION_IDS.has(String(id ?? '').trim().toLowerCase());
}

export function normalizeCatalogOperation(id: string): string {
  return String(id ?? '').trim().toLowerCase();
}

/**
 * Validate Tool / Application operation lists against the catalog.
 * Returns unknown ids (empty = ok).
 */
export function unknownCatalogOperations(ops: string[]): string[] {
  const unknown: string[] = [];
  for (const raw of ops) {
    const id = normalizeCatalogOperation(raw);
    if (!id) continue;
    if (!isCatalogOperation(id)) unknown.push(id);
  }
  return [...new Set(unknown)];
}

export function actionCatalogPayload() {
  return {
    categories: ACTION_CATEGORIES.map((c) => ({ ...c })),
    operations: ACTION_OPERATIONS.map((o) => ({ ...o })),
    write_kinds: WRITE_ACTION_KINDS.map((k) => ({ ...k })),
  };
}
