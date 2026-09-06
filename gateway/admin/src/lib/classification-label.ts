/** Human-readable labels for data classifications. */
const CLASSIFICATION_LABELS: Record<string, string> = {
  phi: 'Protected Health Information (PHI)',
  pii: 'Personally Identifiable Information',
  financial: 'Financial',
  legal: 'Legal',
  credential: 'Credential',
  part2: '42 CFR Part 2',
  tool_or_action: 'Tool or action',
};

export function formatClassificationLabel(
  value: string | undefined | null,
): string {
  if (!value) return '-';
  return value
    .split('|')
    .map((part) => {
      const key = part.trim().toLowerCase();
      if (!key) return '';
      if (CLASSIFICATION_LABELS[key]) return CLASSIFICATION_LABELS[key];
      return formatFallback(part.trim());
    })
    .filter(Boolean)
    .join(', ');
}

function formatFallback(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
