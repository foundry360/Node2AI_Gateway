/** Acronyms that should stay fully uppercase in display labels. */
const ACRONYMS = new Set([
  'ai',
  'api',
  'cfr',
  'epa',
  'gdpr',
  'hipaa',
  'id',
  'pci',
  'phi',
  'pii',
  'sox',
]);

/** Turn snake_case / SCREAMING_SNAKE codes into Title Case labels. */
export function formatFieldLabel(value: string | undefined | null): string {
  if (!value) return value ?? '';
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (lower === 'soc2') return 'SOC 2';
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
