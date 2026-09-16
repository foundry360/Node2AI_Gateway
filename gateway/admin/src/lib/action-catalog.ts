/**
 * Canonical Action catalog — shared with Gateway Admin UI.
 * Keep in sync with gateway/src/actors/action-catalog.ts
 */

export const ACTION_CATEGORIES = [
  { id: 'READ', label: 'Read' },
  { id: 'CREATE', label: 'Create' },
  { id: 'UPDATE', label: 'Update' },
  { id: 'DELETE', label: 'Delete' },
  { id: 'EXECUTE', label: 'Execute' },
  { id: 'TRANSMIT', label: 'Transmit' },
  { id: 'INVOKE', label: 'Invoke' },
  { id: 'OTHER', label: 'Other' },
] as const;

export const ACTION_OPERATIONS = [
  { id: 'summarize', label: 'Summarize', category: 'READ' },
  { id: 'classify', label: 'Classify', category: 'READ' },
  { id: 'generate', label: 'Generate', category: 'READ' },
  { id: 'read', label: 'Read', category: 'READ' },
  { id: 'write', label: 'Write', category: 'UPDATE' },
  { id: 'field_update', label: 'Field update', category: 'UPDATE' },
  { id: 'clinical_note', label: 'Clinical note', category: 'CREATE' },
  { id: 'create', label: 'Create', category: 'CREATE' },
  { id: 'update', label: 'Update', category: 'UPDATE' },
  { id: 'delete', label: 'Delete', category: 'DELETE' },
  { id: 'export', label: 'Export', category: 'TRANSMIT' },
  { id: 'transmit', label: 'Transmit', category: 'TRANSMIT' },
  { id: 'execute', label: 'Execute', category: 'EXECUTE' },
  { id: 'invoke', label: 'Invoke', category: 'INVOKE' },
] as const;

export const ACTION_OPERATION_OPTIONS = ACTION_OPERATIONS.map((o) => ({
  value: o.id,
  label: o.label,
}));

export const WRITE_ACTION_KINDS = [
  { id: 'field_update', label: 'Field update' },
  { id: 'clinical_note', label: 'Clinical note' },
] as const;
